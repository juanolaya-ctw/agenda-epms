// Lógica pura del webhook Tally (sin Deno ni red).
// Un envío se ata a un evento. El toolkit nace en esa membresía.
// Un email que ya existe no pisa la ficha global ni el toolkit de otro evento.

export type TallyField = {
  type?: string
  label?: string | null
  value?: unknown
}

export type FormularioTally = {
  eventoId: string
  tallyFormId: string
  webhookToken: string
  activo: boolean
}

export type ResolucionEvento =
  | { ok: true; eventoId: string }
  | { ok: false; status: 422; error: string }

export type SpeakerTally = Record<string, string | null>

export type PlanIntake =
  | {
      accion: "crear"
      eventoId: string
      speaker: SpeakerTally
      toolkitSlug: string
    }
  | {
      accion: "duplicado"
      eventoId: string
      speakerId: string
      email: string
    }

// Mismos labels que el formulario GovTech pbNMvy. Las keys traen NBSP real;
// normalizarLabel iguala el "&nbsp;" literal que manda Tally.
export const FIELD_MAP: Record<string, string> = {
  "Pais / Country": "pais",
  "Ciudad / City": "ciudad",
  "LinkedIn": "linkedin_url",
  "Tipo de Documento de Identidad / ID type": "tipo_documento",
  "Número de Identificación / ID Number": "numero_documento",
  "Empresa / Organización - Company / Organization": "empresa",
  "Cargo / Rol Actual - Job Title / Current Role": "cargo",
  "Correo Electrónico Secundario o de Asistente (Opcional) / Secondary or Assistant Email Address (Optional)":
    "email_secundario",
  "Material Gráfico (OBLIGATORIO) / Media Assets (REQUIRED)": "foto_url",
}

const RECURSOS_DE_EVENTO = new Set([
  "toolkit_slug",
  "link_pieza_fase1",
  "link_pieza_fase2",
  "link_pieza_fase3",
  "estado_pieza",
])

export function normalizarLabel(label: string): string {
  return label
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

const FIELD_MAP_NORMALIZADO: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([label, campo]) => [
    normalizarLabel(label),
    campo,
  ]),
)

/** lower(trim). Vacío → null. Alineado con normalizeSpeakerEmail del cliente. */
export function normalizarEmailTally(email: string | null | undefined): string | null {
  if (email == null) return null
  const trimmed = email.trim()
  if (!trimmed) return null
  return trimmed.toLowerCase()
}

function extractValue(field: TallyField): string | null {
  const value = field.value
  if (value == null || value === "") return null
  if (Array.isArray(value)) {
    const first = value[0] as { url?: unknown } | undefined
    if (first && typeof first.url === "string" && first.url) return first.url
    return null
  }
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number") return String(value)
  return null
}

/** Arma la ficha global. Nunca incluye slug ni piezas. */
export function parseTallySpeaker(fields: TallyField[]): SpeakerTally {
  const speaker: SpeakerTally = {}
  const nombreField = fields.find(
    (f) => f.type === "INPUT_TEXT" && (f.label === "" || f.label == null),
  )
  if (typeof nombreField?.value === "string" && nombreField.value.trim()) {
    speaker.nombre = nombreField.value.trim()
  }
  const emailField = fields.find((f) => f.type === "INPUT_EMAIL")
  if (typeof emailField?.value === "string") {
    speaker.email = normalizarEmailTally(emailField.value)
  }
  const telefonoField = fields.find((f) => f.type === "INPUT_PHONE_NUMBER")
  if (typeof telefonoField?.value === "string" && telefonoField.value) {
    speaker.telefono = telefonoField.value
  }
  for (const field of fields) {
    if (typeof field.label !== "string" || field.label === "") continue
    const destino = FIELD_MAP_NORMALIZADO[normalizarLabel(field.label)]
    if (!destino || RECURSOS_DE_EVENTO.has(destino)) continue
    speaker[destino] = extractValue(field)
  }
  return speaker
}

export function generarToolkitSlug(nombre: string, shortId: string): string {
  const slugBase = nombre
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
  const id = shortId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)
  return `${slugBase || "speaker"}-${id || "xxxxxx"}`
}

export function resolverEventoTally(input: {
  token: string | null
  formId: string | null
  formularios: FormularioTally[]
}): ResolucionEvento {
  const token = input.token?.trim() || null
  const formId = input.formId?.trim() || null
  const activos = input.formularios.filter((f) => f.activo)

  if (token) {
    const porToken = activos.filter((f) => f.webhookToken === token)
    if (porToken.length !== 1) {
      return {
        ok: false,
        status: 422,
        error: "Webhook desconocido: el token no corresponde a un formulario activo.",
      }
    }
    const form = porToken[0]
    if (formId && form.tallyFormId !== formId) {
      return {
        ok: false,
        status: 422,
        error: "El formulario del payload no es el de este webhook.",
      }
    }
    return { ok: true, eventoId: form.eventoId }
  }

  if (formId) {
    const porForm = activos.filter((f) => f.tallyFormId === formId)
    if (porForm.length !== 1) {
      return {
        ok: false,
        status: 422,
        error: "Formulario Tally no registrado para ningún evento.",
      }
    }
    return { ok: true, eventoId: porForm[0].eventoId }
  }

  return {
    ok: false,
    status: 422,
    error: "El envío no trae token de webhook ni formId.",
  }
}

/**
 * Crear: ficha global nueva (sin recursos de evento) + slug en la membresía.
 * Duplicado: no se actualiza la ficha ni se copia toolkit. El caller solo
 * asegura la membresía vacía de ESTE evento y guarda el payload en la cola.
 */
export function planificarIntake(input: {
  eventoId: string
  speaker: SpeakerTally
  existenteId: string | null
  shortId: string
}): PlanIntake {
  const email = normalizarEmailTally(input.speaker.email) ?? ""
  if (input.existenteId) {
    return {
      accion: "duplicado",
      eventoId: input.eventoId,
      speakerId: input.existenteId,
      email,
    }
  }
  const speaker: SpeakerTally = { fuente: "tally" }
  for (const [key, value] of Object.entries(input.speaker)) {
    if (RECURSOS_DE_EVENTO.has(key)) continue
    speaker[key] = value
  }
  speaker.email = email || null
  const nombre = speaker.nombre?.trim() || "speaker"
  return {
    accion: "crear",
    eventoId: input.eventoId,
    speaker,
    toolkitSlug: generarToolkitSlug(nombre, input.shortId),
  }
}
