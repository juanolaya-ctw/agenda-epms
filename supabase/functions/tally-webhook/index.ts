// supabase/functions/tally-webhook/index.ts
// Edge Function — Webhook de Tally, un formulario por evento.
// Deploy: supabase functions deploy tally-webhook --no-verify-jwt
//
// Variables de entorno (Supabase Dashboard → Edge Functions → Secrets):
//   SB_URL         → https://ydqbjyhcntszvrytdkml.supabase.co
//   SB_SERVICE_KEY → service_role key (nunca la anon key)
//
// Webhook por evento (Settings del workspace, tras aplicar la migración):
//   {SB_URL}/functions/v1/tally-webhook?token=<webhook_token>
// Sin token, el formId del payload (data.formId) se busca en
// epms.tally_formularios. GovTech sigue en pbNMvy.
// Un form no registrado no crea speaker.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizarEmailTally,
  parseTallySpeaker,
  planificarIntake,
  resolverEventoTally,
  type FormularioTally,
  type TallyField,
} from "../_shared/tallyIntake.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
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

  const supabase = createClient(
    Deno.env.get("SB_URL")!,
    Deno.env.get("SB_SERVICE_KEY")!,
  );

  const { data: forms, error: formsError } = await supabase
    .schema("epms")
    .from("tally_formularios")
    .select("evento_id, tally_form_id, webhook_token, activo");

  if (formsError) {
    console.error("Error leyendo tally_formularios:", formsError);
    return json({ error: "No se pudieron leer los formularios Tally" }, 500);
  }

  const formularios: FormularioTally[] = (forms ?? []).map((row) => ({
    eventoId: row.evento_id as string,
    tallyFormId: row.tally_form_id as string,
    webhookToken: row.webhook_token as string,
    activo: row.activo !== false,
  }));

  const evento = resolverEventoTally({ token, formId, formularios });
  if (!evento.ok) {
    console.warn("Tally sin evento:", evento.error, { formId });
    return json({ error: evento.error }, evento.status);
  }

  const speaker = parseTallySpeaker(fields);
  speaker.email = normalizarEmailTally(speaker.email);
  if (!speaker.nombre || !speaker.email) {
    console.error("Payload sin nombre o email:", JSON.stringify(speaker));
    return json({ error: "nombre y email son obligatorios" }, 422);
  }

  const { data: existenteId, error: lookupError } = await supabase
    .schema("epms")
    .rpc("buscar_speaker_por_email", { p_email: speaker.email });

  if (lookupError) {
    console.error("Error al verificar duplicado:", lookupError);
    return json({ error: "Error interno al verificar email" }, 500);
  }

  const plan = planificarIntake({
    eventoId: evento.eventoId,
    speaker,
    existenteId: typeof existenteId === "string" ? existenteId : null,
    shortId: crypto.randomUUID().slice(0, 6),
  });

  if (plan.accion === "duplicado") {
    return await registrarDuplicado(supabase, body, plan);
  }

  if (plan.speaker.foto_url && plan.speaker.foto_url.includes("storage.tally.so")) {
    plan.speaker.foto_url = await realojarFoto(
      supabase,
      plan.speaker.foto_url,
      plan.speaker.email ?? "speaker",
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .schema("epms")
    .from("speakers")
    .insert(plan.speaker)
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Carrera: otro envío creó el mismo email. No se pisa la ficha.
    if (insertError && /duplicate|unique/i.test(insertError.message)) {
      const { data: idOtraVez } = await supabase
        .schema("epms")
        .rpc("buscar_speaker_por_email", { p_email: plan.speaker.email });
      if (typeof idOtraVez === "string") {
        return await registrarDuplicado(supabase, body, {
          accion: "duplicado",
          eventoId: plan.eventoId,
          speakerId: idOtraVez,
          email: plan.speaker.email ?? "",
        });
      }
    }
    console.error("Error al insertar speaker:", insertError);
    return json(
      { error: "Error al insertar speaker", detail: insertError?.message },
      500,
    );
  }

  const speakerId = inserted.id as string;
  const membresia = await asegurarMembresia(supabase, plan.eventoId, speakerId, {
    toolkitSlug: plan.toolkitSlug,
  });
  if (!membresia.ok) {
    console.error("Speaker creado sin membresía:", speakerId, membresia.error);
    return json(
      {
        error: "Speaker creado, pero no se pudo asociar al evento",
        speaker_id: speakerId,
        detail: membresia.error,
      },
      500,
    );
  }

  console.log(
    `Speaker insertado: ${plan.speaker.nombre} <${plan.speaker.email}> evento ${plan.eventoId}`,
  );
  return json({
    status: "ok",
    message: `Speaker ${plan.speaker.nombre} registrado.`,
    speaker_id: speakerId,
    evento_id: plan.eventoId,
  });
});

type SupabaseAdmin = ReturnType<typeof createClient>;

async function realojarFoto(
  supabase: SupabaseAdmin,
  fotoUrl: string,
  email: string,
): Promise<string> {
  try {
    const imgRes = await fetch(fotoUrl);
    if (!imgRes.ok) return fotoUrl;
    const blob = await imgRes.blob();
    const ext = blob.type.split("/")[1] || "jpg";
    const filename = `speakers/${email}-${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("speaker-fotos")
      .upload(filename, blob, { contentType: blob.type, upsert: true });
    if (uploadError || !uploadData) return fotoUrl;
    const { data: urlData } = supabase.storage
      .from("speaker-fotos")
      .getPublicUrl(filename);
    return urlData.publicUrl || fotoUrl;
  } catch (e) {
    console.error("Error re-alojando foto:", e);
    return fotoUrl;
  }
}

async function asegurarMembresia(
  supabase: SupabaseAdmin,
  eventoId: string,
  speakerId: string,
  opts: { toolkitSlug?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existError } = await supabase
    .schema("epms")
    .from("evento_speakers")
    .select("speaker_id, toolkit_slug")
    .eq("evento_id", eventoId)
    .eq("speaker_id", speakerId)
    .maybeSingle();

  if (existError) return { ok: false, error: existError.message };

  if (!existing) {
    const row: Record<string, string> = {
      evento_id: eventoId,
      speaker_id: speakerId,
      estado: "PENDIENTE_CONTACTAR",
    };
    if (opts.toolkitSlug) row.toolkit_slug = opts.toolkitSlug;
    const { error } = await supabase.schema("epms").from("evento_speakers").insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // Ya está en el evento: no se toca estado ni toolkit de esta ni de otra participación.
  return { ok: true };
}

async function registrarDuplicado(
  supabase: SupabaseAdmin,
  body: Record<string, unknown>,
  plan: { eventoId: string; speakerId: string; email: string },
): Promise<Response> {
  console.warn(
    `Email duplicado: ${plan.email} evento ${plan.eventoId} — cola de revisión, sin pisar la ficha`,
  );

  const membresia = await asegurarMembresia(supabase, plan.eventoId, plan.speakerId, {});
  if (!membresia.ok) {
    console.error("No se pudo asegurar la membresía del duplicado:", membresia.error);
    return json(
      { error: "No se pudo asociar el speaker al evento", detail: membresia.error },
      500,
    );
  }

  const { error: dupError } = await supabase
    .schema("epms")
    .from("tally_duplicados_pendientes")
    .insert({
      email: plan.email,
      evento_id: plan.eventoId,
      payload_raw: body,
    });

  if (dupError) {
    console.error("Error al guardar duplicado:", dupError);
  }

  return json({
    status: "duplicado",
    message: "Email ya registrado. Submit guardado en cola de revisión.",
    speaker_id: plan.speakerId,
    evento_id: plan.eventoId,
  });
}
