// Lógica pura del webhook Tally (sin Deno ni red).
// Fase 5: cada envío se persiste; solo email exacto vincula; nombre → revisión.
// Un email que ya existe no pisa la ficha global ni el toolkit de otro evento.

export type TallyField = {
  type?: string
  label?: string | null
  value?: unknown
  options?: Array<{ id?: string | number; text?: string }>
}

export type FormularioTally = {
  eventoId: string
  tallyFormId: string
  webhookToken: string
  activo: boolean
  mapeoCampos?: Record<string, string> | null
}

export type MotivoResolucion =
  | "token_invalido"
  | "form_desconocido"
  | "sin_identificador"

export type ResolucionEvento =
  | { ok: true; eventoId: string; mapeoCampos?: Record<string, string> | null }
  | {
      ok: false
      status: 422
      error: string
      motivo: MotivoResolucion
    }

export type SpeakerTally = Record<string, string | null>

export type RespuestaTally = {
  label: string
  tipo: string
  valor: unknown
}

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

/** Destinos permitidos en mapeo_campos (nunca nombre/email/toolkit/piezas). */
export const MAPEO_CAMPOS_WHITELIST = new Set([
  "pais",
  "ciudad",
  "linkedin_url",
  "tipo_documento",
  "numero_documento",
  "empresa",
  "cargo",
  "email_secundario",
  "foto_url",
  "telefono",
])

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
export function normalizarEmailTally(
  email: string | null | undefined,
): string | null {
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

function mapaConOverrides(
  mapeo?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = { ...FIELD_MAP_NORMALIZADO }
  if (!mapeo || typeof mapeo !== "object") return out
  for (const [labelRaw, destinoRaw] of Object.entries(mapeo)) {
    const destino = String(destinoRaw ?? "").trim()
    if (!MAPEO_CAMPOS_WHITELIST.has(destino)) continue
    if (RECURSOS_DE_EVENTO.has(destino)) continue
    if (destino === "nombre" || destino === "email") continue
    const key = normalizarLabel(String(labelRaw ?? ""))
    if (!key) continue
    out[key] = destino
  }
  return out
}

/** Arma la ficha global. Nunca incluye slug ni piezas. */
export function parseTallySpeaker(
  fields: TallyField[],
  mapeo?: Record<string, string> | null,
): SpeakerTally {
  const speaker: SpeakerTally = {}
  const mapa = mapaConOverrides(mapeo)
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
    const destino = mapa[normalizarLabel(field.label)]
    if (!destino || RECURSOS_DE_EVENTO.has(destino)) continue
    speaker[destino] = extractValue(field)
  }
  return speaker
}

/**
 * Todas las respuestas del formulario (incl. propias del evento).
 * Opciones múltiples: ids → textos; archivos → URL(s); vacíos omitidos.
 */
export function extraerRespuestas(fields: TallyField[]): RespuestaTally[] {
  const out: RespuestaTally[] = []
  for (const field of fields) {
    const rawLabel =
      typeof field.label === "string" && field.label !== ""
        ? field.label
        : field.type === "INPUT_TEXT"
          ? "Nombre"
          : field.type === "INPUT_EMAIL"
            ? "Email"
            : field.type === "INPUT_PHONE_NUMBER"
              ? "Teléfono"
              : null
    if (rawLabel == null) continue
    const labelClean = rawLabel
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
    if (!labelClean) continue

    const tipo = typeof field.type === "string" ? field.type : "UNKNOWN"
    const valor = valorRespuesta(field)
    if (valor === undefined) continue
    out.push({
      label: labelClean,
      tipo,
      valor,
    })
  }
  return out
}

function valorRespuesta(field: TallyField): unknown | undefined {
  const value = field.value
  if (value == null || value === "") return undefined

  if (Array.isArray(value)) {
    // Archivos: [{ url }]
    const urls = value
      .map((v) => {
        if (v && typeof v === "object" && "url" in v) {
          const u = (v as { url?: unknown }).url
          return typeof u === "string" && u ? u : null
        }
        return null
      })
      .filter((u): u is string => !!u)
    if (urls.length > 0) return urls.length === 1 ? urls[0] : urls

    // Opción múltiple: lista de ids → textos vía options
    if (field.options && field.options.length > 0) {
      const byId = new Map(
        field.options
          .filter((o) => o.id != null && typeof o.text === "string")
          .map((o) => [String(o.id), o.text as string]),
      )
      const texts = value
        .map((id) => byId.get(String(id)))
        .filter((t): t is string => typeof t === "string" && t.trim() !== "")
      if (texts.length === 0) return undefined
      return texts
    }

    // Lista de strings sueltos
    const strs = value.filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    )
    if (strs.length > 0) return strs
    return undefined
  }

  if (typeof value === "number") return value
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const t = value.trim()
    return t === "" ? undefined : t
  }
  return undefined
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

/**
 * Clave de idempotencia del envío.
 * Preferencia: submissionId → responseId → eventId → sha256(raw).
 */
export async function claveEnvio(
  body: Record<string, unknown>,
  rawText: string,
): Promise<string> {
  const data = (body.data ?? {}) as Record<string, unknown>
  const submissionId =
    (typeof data.submissionId === "string" && data.submissionId.trim()) ||
    null
  if (submissionId) return `sub:${submissionId}`

  const responseId =
    (typeof data.responseId === "string" && data.responseId.trim()) || null
  if (responseId) return `resp:${responseId}`

  const eventId =
    (typeof body.eventId === "string" && body.eventId.trim()) || null
  if (eventId) return `evt:${eventId}`

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawText),
  )
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `sha256:${hex}`
}

/**
 * true si conviene consultar tally_envios por clave (replay).
 * false para token_invalido / sin_identificador (422 sin tocar BD de envíos).
 */
export function debeBuscarReenvio(resolucion: ResolucionEvento): boolean {
  if (resolucion.ok) return true
  return resolucion.motivo === "form_desconocido"
}

export function resolverEventoTally(input: {
  token: string | null
  formId: string | null
  formularios: FormularioTally[]
}): ResolucionEvento {
  const token = input.token?.trim() || null
  const formId = input.formId?.trim() || null
  const todos = input.formularios
  const activos = todos.filter((f) => f.activo)

  if (token) {
    const porTokenActivo = activos.filter((f) => f.webhookToken === token)
    if (porTokenActivo.length === 1) {
      const form = porTokenActivo[0]!
      if (formId && form.tallyFormId !== formId) {
        return {
          ok: false,
          status: 422,
          error: "El formulario del payload no es el de este webhook.",
          motivo: "token_invalido",
        }
      }
      return {
        ok: true,
        eventoId: form.eventoId,
        ...(form.mapeoCampos ? { mapeoCampos: form.mapeoCampos } : {}),
      }
    }
    // Token existe pero formulario inactivo → desconocido (guardar)
    const porTokenCualquiera = todos.filter((f) => f.webhookToken === token)
    if (porTokenCualquiera.length >= 1) {
      return {
        ok: false,
        status: 422,
        error: "Formulario Tally no registrado para ningún evento.",
        motivo: "form_desconocido",
      }
    }
    return {
      ok: false,
      status: 422,
      error:
        "Webhook desconocido: el token no corresponde a un formulario activo.",
      motivo: "token_invalido",
    }
  }

  if (formId) {
    const porFormActivo = activos.filter((f) => f.tallyFormId === formId)
    if (porFormActivo.length === 1) {
      const form = porFormActivo[0]!
      return {
        ok: true,
        eventoId: form.eventoId,
        ...(form.mapeoCampos ? { mapeoCampos: form.mapeoCampos } : {}),
      }
    }
    // Registrado inactivo o no registrado → desconocido (guardar)
    return {
      ok: false,
      status: 422,
      error: "Formulario Tally no registrado para ningún evento.",
      motivo: "form_desconocido",
    }
  }

  return {
    ok: false,
    status: 422,
    error: "El envío no trae token de webhook ni formId.",
    motivo: "sin_identificador",
  }
}

/**
 * @deprecated Fase 5: la vinculación vive en epms.registrar_tally_envio.
 * Se conserva para los tests de la Fase 0.
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
