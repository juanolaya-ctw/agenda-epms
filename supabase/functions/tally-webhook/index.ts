// supabase/functions/tally-webhook/index.ts
// Edge Function — Webhook de Tally por evento (Fase 5).
// Deploy: supabase functions deploy tally-webhook --no-verify-jwt
// (también se puede desplegar con otro slug para QA; el código no depende del nombre).
//
// Variables de entorno (Supabase Dashboard → Edge Functions → Secrets):
//   SB_URL         → https://ydqbjyhcntszvrytdkml.supabase.co
//   SB_SERVICE_KEY → service_role key (nunca la anon key)
//
// Webhook por evento (Settings del workspace):
//   {SB_URL}/functions/v1/<slug>?token=<webhook_token>
// Sin token, el formId del payload (data.formId) se busca en
// epms.tally_formularios. GovTech (pbNMvy) sigue funcionando por formId.
//
// Requiere la migración 20261129_fase5_tally.sql (bloque 1a de grants
// como mínimo). Sin ella, service_role no puede leer tally_formularios.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  claveEnvio,
  debeBuscarReenvio,
  extraerRespuestas,
  generarToolkitSlug,
  normalizarEmailTally,
  parseTallySpeaker,
  resolverEventoTally,
  type FormularioTally,
  type TallyField,
} from "../_shared/tallyIntake.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Log de error sin PII: solo code o literal corto. */
function errCode(err: { code?: string } | null | undefined): string {
  return err?.code && String(err.code).trim() !== ""
    ? String(err.code)
    : "unknown";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawText = await req.text();
  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Payload demasiado grande" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const data = (body.data ?? {}) as Record<string, unknown>;
  const fields = (data.fields ?? []) as TallyField[];
  if (!Array.isArray(fields) || fields.length === 0) {
    return new Response("No fields in payload", { status: 400 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const formId =
    (typeof data.formId === "string" && data.formId) ||
    (typeof body.formId === "string" && body.formId) ||
    null;
  const submissionId =
    typeof data.submissionId === "string" ? data.submissionId : null;
  const submittedAtRaw =
    (typeof data.createdAt === "string" && data.createdAt) ||
    (typeof body.createdAt === "string" && body.createdAt) ||
    null;
  const submittedAt = submittedAtRaw ? new Date(submittedAtRaw) : null;
  const submittedAtIso =
    submittedAt && !Number.isNaN(submittedAt.getTime())
      ? submittedAt.toISOString()
      : null;

  const supabase = createClient(
    Deno.env.get("SB_URL")!,
    Deno.env.get("SB_SERVICE_KEY")!,
  );

  const clave = await claveEnvio(body, rawText);

  const { data: forms, error: formsError } = await supabase
    .schema("epms")
    .from("tally_formularios")
    .select("evento_id, tally_form_id, webhook_token, activo, mapeo_campos");

  if (formsError) {
    console.error("Error leyendo tally_formularios:", errCode(formsError));
    return json({ error: "No se pudieron leer los formularios Tally" }, 500);
  }

  const formularios: FormularioTally[] = (forms ?? []).map((row) => ({
    eventoId: row.evento_id as string,
    tallyFormId: row.tally_form_id as string,
    webhookToken: row.webhook_token as string,
    activo: row.activo !== false,
    mapeoCampos:
      row.mapeo_campos && typeof row.mapeo_campos === "object"
        ? (row.mapeo_campos as Record<string, string>)
        : null,
  }));

  const evento = resolverEventoTally({ token, formId, formularios });

  if (!evento.ok && !debeBuscarReenvio(evento)) {
    // token_invalido | sin_identificador → 422 sin consultar envíos ni RPC
    console.warn("Tally rechazo sin guardar", { motivo: evento.motivo });
    return json({ error: evento.error }, evento.status);
  }

  // Replay solo si el token/formulario permiten persistir
  const { data: existente, error: existErr } = await supabase
    .schema("epms")
    .from("tally_envios")
    .select("id, estado, razon, speaker_id, evento_id")
    .eq("clave", clave)
    .maybeSingle();

  if (existErr) {
    console.error("Error leyendo tally_envios:", errCode(existErr));
    return json({ error: "Error interno" }, 500);
  }
  if (existente) {
    console.log("Tally reenvio", {
      envio_id: existente.id,
      evento_id: existente.evento_id,
      estado: existente.estado,
      razon: existente.razon,
    });
    return json({
      status: "reenvio",
      envio_id: existente.id,
      estado: existente.estado,
      speaker_id: existente.speaker_id,
      evento_id: existente.evento_id,
    });
  }

  if (!evento.ok) {
    // form_desconocido (no registrado o inactivo) → persistir y 422
    const rpcDesc = await supabase.schema("epms").rpc("registrar_tally_envio", {
      p_clave: clave,
      p_form_id: formId,
      p_evento_id: null,
      p_submission_id: submissionId,
      p_submitted_at: submittedAtIso,
      p_payload: body,
      p_campos: {},
      p_respuestas: extraerRespuestas(fields),
      p_toolkit_slug: null,
      p_modo: "desconocido",
    });
    if (rpcDesc.error) {
      console.error("RPC desconocido:", errCode(rpcDesc.error));
      return json({ error: "Error interno" }, 500);
    }
    const r = rpcDesc.data as Record<string, unknown>;
    console.warn("Tally formulario desconocido", {
      envio_id: r.envio_id,
      estado: r.estado,
      razon: r.razon,
    });
    return json(
      {
        error: evento.error,
        envio_id: r.envio_id,
        estado: r.estado,
      },
      422,
    );
  }

  const speaker = parseTallySpeaker(fields, evento.mapeoCampos ?? null);
  speaker.email = normalizarEmailTally(speaker.email);
  const respuestas = extraerRespuestas(fields);

  if (!speaker.nombre || !speaker.email) {
    const rpcInv = await supabase.schema("epms").rpc("registrar_tally_envio", {
      p_clave: clave,
      p_form_id: formId,
      p_evento_id: evento.eventoId,
      p_submission_id: submissionId,
      p_submitted_at: submittedAtIso,
      p_payload: body,
      p_campos: speaker,
      p_respuestas: respuestas,
      p_toolkit_slug: null,
      p_modo: "invalido",
    });
    if (rpcInv.error) {
      console.error("RPC invalido:", errCode(rpcInv.error));
      return json({ error: "Error interno" }, 500);
    }
    const r = rpcInv.data as Record<string, unknown>;
    console.warn("Tally payload invalido", {
      envio_id: r.envio_id,
      evento_id: evento.eventoId,
      estado: r.estado,
      razon: r.razon,
    });
    return json(
      {
        error: "nombre y email son obligatorios",
        envio_id: r.envio_id,
        estado: r.estado,
      },
      422,
    );
  }

  if (speaker.foto_url && speaker.foto_url.includes("storage.tally.so")) {
    speaker.foto_url = await realojarFoto(supabase, speaker.foto_url, clave);
  }

  const shortId = crypto.randomUUID().slice(0, 6);
  const toolkitSlug = generarToolkitSlug(speaker.nombre, shortId);

  const { data: rpcData, error: rpcError } = await supabase
    .schema("epms")
    .rpc("registrar_tally_envio", {
      p_clave: clave,
      p_form_id: formId,
      p_evento_id: evento.eventoId,
      p_submission_id: submissionId,
      p_submitted_at: submittedAtIso,
      p_payload: body,
      p_campos: speaker,
      p_respuestas: respuestas,
      p_toolkit_slug: toolkitSlug,
      p_modo: "procesar",
    });

  if (rpcError) {
    console.error("RPC procesar:", errCode(rpcError));
    return json({ error: "Error interno" }, 500);
  }

  const result = rpcData as {
    envio_id: string;
    estado: string;
    razon: string | null;
    speaker_id: string | null;
    evento_id: string | null;
    replay?: boolean;
    speaker_creado?: boolean;
  };

  if (result.replay) {
    console.log("Tally reenvio", {
      envio_id: result.envio_id,
      evento_id: result.evento_id,
      estado: result.estado,
      razon: result.razon,
    });
    return json({
      status: "reenvio",
      envio_id: result.envio_id,
      estado: result.estado,
      speaker_id: result.speaker_id,
      evento_id: result.evento_id,
    });
  }

  console.log("Tally ok", {
    envio_id: result.envio_id,
    evento_id: result.evento_id,
    estado: result.estado,
    razon: result.razon,
  });

  return json({
    status: "ok",
    envio_id: result.envio_id,
    estado: result.estado,
    speaker_id: result.speaker_id,
    evento_id: result.evento_id,
  });
});

type SupabaseAdmin = ReturnType<typeof createClient>;

async function realojarFoto(
  supabase: SupabaseAdmin,
  fotoUrl: string,
  clave: string,
): Promise<string> {
  try {
    const imgRes = await fetch(fotoUrl);
    if (!imgRes.ok) return fotoUrl;
    const blob = await imgRes.blob();
    const ext = blob.type.split("/")[1] || "jpg";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(clave),
    );
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const filename = `speakers/tally-${hex.slice(0, 8)}-${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("speaker-fotos")
      .upload(filename, blob, { contentType: blob.type, upsert: true });
    if (uploadError || !uploadData) return fotoUrl;
    const { data: urlData } = supabase.storage
      .from("speaker-fotos")
      .getPublicUrl(filename);
    return urlData.publicUrl || fotoUrl;
  } catch {
    console.error("Error re-alojando foto:", "unknown");
    return fotoUrl;
  }
}
