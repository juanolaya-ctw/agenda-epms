// supabase/functions/tally-webhook/index.ts
// Edge Function — Webhook de Tally → INSERT en epms.speakers
// Deploy: supabase functions deploy tally-webhook --no-verify-jwt
//
// Variables de entorno requeridas (Supabase Dashboard → Edge Functions → Secrets):
//   SB_URL        → https://ydqbjyhcntszvrytdkml.supabase.co
//   SB_SERVICE_KEY → service_role key (nunca la anon key)
//
// En Tally: Settings → Webhooks → URL = https://ydqbjyhcntszvrytdkml.supabase.co/functions/v1/tally-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Mapeo de labels de Tally → campos de Supabase ──────────────────────────
// Los labels son el texto exacto de la pregunta en el formulario de Tally.
// Si renombras una pregunta en Tally, actualiza el mapeo aquí.
const FIELD_MAP: Record<string, string> = {
  // Nombre: primer campo, label vacío — se maneja por posición
  "Pais / Country":                                                          "pais",
  "Ciudad / City":                                                           "ciudad",
  "LinkedIn":                                                                "linkedin_url",
  "Tipo de Documento de Identidad / ID type":                          "tipo_documento",
  "Número de Identificación / ID Number":                              "numero_documento",
  "Empresa / Organización - Company / Organization":                   "empresa",
  "Cargo / Rol Actual - Job Title / Current Role":                     "cargo",
  "Correo Electrónico Secundario o de Asistente (Opcional) / Secondary or Assistant Email Address (Optional)": "email_secundario",
  "Material Gráfico (OBLIGATORIO) / Media Assets (REQUIRED)":          "foto_url",
};

// ─── Normalización de labels ────────────────────────────────────────────────
// Tally envía labels con la entidad HTML literal "&nbsp;" sin decodificar
// donde el FIELD_MAP tiene el carácter NBSP real; normalizamos ambos lados.
function normalizarLabel(label: string): string {
  // Causa confirmada por codepoints: Tally manda la entidad HTML literal
  // "&nbsp;" (6 chars) en vez del caracter NBSP real (U+00A0) de las keys.
  // Orden: decodificar entidades -> NFKC -> colapsar espacios.
  return label
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .normalize("NFKC")      // formas Unicode equivalentes → forma canónica
    .replace(/\s+/g, " ")   // cualquier tipo de espacio (NBSP, thin, etc.) → espacio normal
    .trim()
    .toLowerCase();
}

// FIELD_MAP con las keys ya normalizadas.
const FIELD_MAP_NORMALIZADO: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([label, campo]) => [
    normalizarLabel(label),
    campo,
  ])
);

// ─── Extrae el valor plano de un campo Tally ────────────────────────────────
function extractValue(field: any): string | null {
  const value = field?.value;
  if (!value) return null;

  // Archivos subidos a Tally (foto): array de objetos con `url`
  if (Array.isArray(value) && value[0]?.url) {
    return value[0].url;
  }
  // Valor simple (texto, email, teléfono)
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);

  return null;
}

// ─── Handler principal ───────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Tally envía POST; rechazar cualquier otro método
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // El payload de Tally tiene la forma: { data: { fields: [...] } }
  const fields: any[] = body?.data?.fields ?? [];

  if (fields.length === 0) {
    return new Response("No fields in payload", { status: 400 });
  }

  // ── Construir objeto speaker desde el payload ──────────────────────────────
  const speaker: Record<string, string | null> = {};

  // Nombre: primer INPUT_TEXT con label vacío o primer campo
  const nombreField = fields.find((f: any) =>
    f.type === 'INPUT_TEXT' && (f.label === '' || f.label === null)
  );
  if (nombreField?.value) speaker.nombre = nombreField.value.trim();

  // Email: campo tipo INPUT_EMAIL (label tiene \n)
  const emailField = fields.find((f: any) => f.type === 'INPUT_EMAIL');
  if (emailField?.value) speaker.email = emailField.value.toLowerCase().trim();

  // Teléfono: campo tipo INPUT_PHONE_NUMBER
  const telefonoField = fields.find((f: any) => f.type === 'INPUT_PHONE_NUMBER');
  if (telefonoField?.value) speaker.telefono = telefonoField.value;

  for (const f of fields) {
    if (typeof f?.label !== "string" || f.label === "") continue;
    const campoDestino = FIELD_MAP_NORMALIZADO[normalizarLabel(f.label)];
    if (campoDestino) {
      speaker[campoDestino] = extractValue(f);
    }
  }

  // `nombre` y `email` son obligatorios — si faltan, rechazar
  if (!speaker.nombre || !speaker.email) {
    console.error("Payload sin nombre o email:", JSON.stringify(speaker));
    return new Response(
      JSON.stringify({ error: "nombre y email son obligatorios" }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  // Normalizar email (lowercase, sin espacios)
  speaker.email = speaker.email.toLowerCase().trim();
  speaker.fuente = "tally";

  // ── Cliente Supabase con service_role (bypassa RLS) ───────────────────────
  const supabase = createClient(
    Deno.env.get("SB_URL")!,
    Deno.env.get("SB_SERVICE_KEY")!
  );

  // ── Re-alojar la foto: la URL firmada de Tally Storage expira ─────────────
  if (speaker.foto_url && speaker.foto_url.includes('storage.tally.so')) {
    try {
      const imgRes = await fetch(speaker.foto_url);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const ext = blob.type.split('/')[1] || 'jpg';
        const filename = `speakers/${speaker.email}-${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('speaker-fotos')
          .upload(filename, blob, {
            contentType: blob.type,
            upsert: true
          });
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase
            .storage
            .from('speaker-fotos')
            .getPublicUrl(filename);
          speaker.foto_url = urlData.publicUrl;
        }
      }
    } catch (e) {
      console.error('Error re-alojando foto:', e);
      // Si falla, guarda la URL original (fallback)
    }
  }

  // ── Regla de no-duplicado: verificar si el email ya existe ────────────────
  const { data: existing, error: checkError } = await supabase
    .schema("epms")
    .from("speakers")
    .select("id, email")
    .eq("email", speaker.email)
    .maybeSingle();

  if (checkError) {
    console.error("Error al verificar duplicado:", checkError);
    return new Response(
      JSON.stringify({ error: "Error interno al verificar email" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (existing) {
    // Email ya existe → guardar en tabla de duplicados pendientes para revisión manual
    console.warn(`Email duplicado detectado: ${speaker.email} — enviando a tally_duplicados_pendientes`);

    const { error: dupError } = await supabase
      .schema("epms")
      .from("tally_duplicados_pendientes")
      .insert({
        email: speaker.email,
        payload_raw: body,   // payload completo de Tally para que Agenda revise
      });

    if (dupError) {
      console.error("Error al guardar duplicado:", dupError);
      // No falla la request hacia Tally (Tally reintentaría si recibe 5xx)
    }

    return new Response(
      JSON.stringify({
        status: "duplicado",
        message: "Email ya registrado. Submit guardado en cola de revisión.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Generar toolkit_slug único para la URL pública del toolkit
  const slugBase = (speaker.nombre as string)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")  // quitar tildes
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const shortId = crypto.randomUUID().slice(0, 6);
  speaker.toolkit_slug = `${slugBase}-${shortId}`;

  // ── INSERT del speaker nuevo ───────────────────────────────────────────────
  const { error: insertError } = await supabase
    .schema("epms")
    .from("speakers")
    .insert(speaker);

  if (insertError) {
    console.error("Error al insertar speaker:", insertError);
    return new Response(
      JSON.stringify({ error: "Error al insertar speaker", detail: insertError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Speaker insertado correctamente: ${speaker.nombre} <${speaker.email}>`);
  return new Response(
    JSON.stringify({ status: "ok", message: `Speaker ${speaker.nombre} registrado.` }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
