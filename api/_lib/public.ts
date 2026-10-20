import { normalizarColorEscenario } from './color.ts'

export const AGENDA_TZ = 'America/Bogota'

/** Estado que Agenda marca cuando la sesión entra al programa público. */
export const ESTADO_PUBLICO = 'CONFIRMADA'

const ROL_RANK: Record<string, number> = {
  keynote: 0,
  moderador: 1,
  host: 2,
  panelista: 3,
}

export type AgendaFiltros = {
  eventoId: string | null
  fecha: string | null
}

export type EventoPublico = {
  id: string
  nombre: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

export type SpeakerPublico = {
  id: string
  nombre: string
  rol: string
  cargo: string | null
  empresa: string | null
  foto_url: string | null
  bio: string | null
}

export type EscenarioPublico = {
  id: string
  nombre: string
  color: string
}

export type SesionPublica = {
  id: string
  titulo: string
  descripcion: string | null
  fecha: string
  inicio: string
  fin: string
  escenario: EscenarioPublico
  track: string | null
  formato: string | null
  idioma: string | null
  evento: EventoPublico
  speakers: SpeakerPublico[]
}

export type AgendaBody = {
  timezone: typeof AGENDA_TZ
  generado_en: string
  filtros: { evento_id: string | null; fecha: string | null }
  evento: EventoPublico | null
  sesiones: SesionPublica[]
}

export type RawSesion = {
  id: string
  titulo: string
  descripcion: string | null
  formato: string | null
  track: string | null
  idioma: string | null
  fecha: string
  horaInicio: string
  horaFin: string
  evento: EventoPublico
  escenario: { id: string; nombre: string; color: string | null }
  speakers: SpeakerPublico[]
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function parseAgendaQuery(url: URL):
  | { ok: true; filtros: AgendaFiltros; format: 'json' | 'ics' }
  | { ok: false; error: string } {
  const eventoRaw = (
    url.searchParams.get('evento') ??
    url.searchParams.get('evento_id') ??
    ''
  ).trim()
  const fechaRaw = (
    url.searchParams.get('date') ??
    url.searchParams.get('fecha') ??
    ''
  ).trim()
  const formatRaw = (url.searchParams.get('format') ?? 'json').trim().toLowerCase()

  if (formatRaw !== 'json' && formatRaw !== 'ics') {
    return { ok: false, error: 'format debe ser json o ics' }
  }
  if (eventoRaw && !isUuid(eventoRaw)) {
    return { ok: false, error: 'evento debe ser un UUID' }
  }
  if (fechaRaw && !isFecha(fechaRaw)) {
    return { ok: false, error: 'date debe ser YYYY-MM-DD' }
  }

  return {
    ok: true,
    format: formatRaw,
    filtros: {
      eventoId: eventoRaw || null,
      fecha: fechaRaw || null,
    },
  }
}

export function isFecha(value: string): boolean {
  const match = FECHA_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function estadoEsPublico(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === ESTADO_PUBLICO
}

export function bogotaOffset(date: Date): string {
  const name =
    new Intl.DateTimeFormat('en-US', {
      timeZone: AGENDA_TZ,
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-05:00'
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name)
  if (!match) return '-05:00'
  const minutes = (match[3] ?? '00').padStart(2, '0')
  return `${match[1]}${match[2].padStart(2, '0')}:${minutes}`
}

export function isoBogota(fecha: string, hora: string): string {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(hora.trim())
  if (!isFecha(fecha) || !match) {
    throw new Error('Fecha u hora inválida')
  }
  const [year, month, day] = fecha.split('-').map(Number)
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const offset = bogotaOffset(anchor)
  return `${fecha}T${match[1]}:${match[2]}:${match[3] ?? '00'}${offset}`
}

export function ahoraBogota(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AGENDA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}${bogotaOffset(now)}`
}

export function buildAgendaBody(args: {
  rows: RawSesion[]
  filtros: AgendaFiltros
  evento: EventoPublico | null
  now?: Date
  /** Origen público (https://agenda.colombiatech.co). Las fotos salen por /api/speaker-foto. */
  assetOrigin?: string | null
}): AgendaBody {
  const sesiones = [...args.rows]
    .sort(compareSesiones)
    .map((row) => toSesionPublica(row, args.assetOrigin))
  const evento =
    args.evento ??
    (uniqueEvento(sesiones.map((sesion) => sesion.evento)) ?? null)
  return {
    timezone: AGENDA_TZ,
    generado_en: ahoraBogota(args.now),
    filtros: {
      evento_id: args.filtros.eventoId,
      fecha: args.filtros.fecha,
    },
    evento,
    sesiones,
  }
}

export function toIcs(body: AgendaBody, now = new Date()): string {
  const calName = body.evento?.nombre ?? 'Agenda EPMS'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colombia Tech//EPMS Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calName)}`,
    `X-WR-TIMEZONE:${AGENDA_TZ}`,
    'BEGIN:VTIMEZONE',
    `TZID:${AGENDA_TZ}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0500',
    'TZNAME:COT',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ]

  const stamp = icsUtc(now)
  for (const sesion of body.sesiones) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${sesion.id}@agenda.colombiatech.co`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${AGENDA_TZ}:${icsLocal(sesion.inicio)}`,
      `DTEND;TZID=${AGENDA_TZ}:${icsLocal(sesion.fin)}`,
      `SUMMARY:${escapeIcs(sesion.titulo)}`,
      `LOCATION:${escapeIcs(sesion.escenario.nombre)}`,
      `DESCRIPTION:${escapeIcs(icsDescription(sesion))}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function httpUrlOrNull(value: unknown): string | null {
  const text = textOrNull(value)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function assignEscenarioColors(
  rows: RawSesion[],
  catalog: { id: string; nombre: string; eventoId: string; color: string | null }[],
): void {
  const byEvent = new Map<string, { id: string; nombre: string; color: string | null }[]>()
  for (const item of catalog) {
    const list = byEvent.get(item.eventoId) ?? []
    list.push(item)
    byEvent.set(item.eventoId, list)
  }
  const colorById = new Map<string, string>()
  for (const list of byEvent.values()) {
    list.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id))
    list.forEach((item, index) => {
      colorById.set(item.id, normalizarColorEscenario(item.color, index))
    })
  }
  for (const row of rows) {
    row.escenario.color =
      colorById.get(row.escenario.id) ??
      normalizarColorEscenario(row.escenario.color, 0)
  }
}

function toSesionPublica(row: RawSesion, assetOrigin?: string | null): SesionPublica {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: redactEmails(row.descripcion),
    fecha: row.fecha,
    inicio: isoBogota(row.fecha, row.horaInicio),
    fin: isoBogota(row.fecha, row.horaFin),
    escenario: {
      id: row.escenario.id,
      nombre: row.escenario.nombre,
      color: row.escenario.color ?? normalizarColorEscenario(null, 0),
    },
    track: row.track,
    formato: row.formato,
    idioma: row.idioma,
    evento: row.evento,
    speakers: [...row.speakers].sort(compareSpeakers).map((speaker) => ({
      id: speaker.id,
      nombre: speaker.nombre,
      rol: speaker.rol,
      cargo: redactEmails(speaker.cargo),
      empresa: redactEmails(speaker.empresa),
      foto_url: publicFotoUrl(assetOrigin, speaker),
      bio: redactEmails(speaker.bio),
    })),
  }
}

/** El objeto en Storage a veces lleva el email en el nombre del archivo. */
function publicFotoUrl(origin: string | null | undefined, speaker: SpeakerPublico): string | null {
  if (!speaker.foto_url || !origin) return null
  const url = new URL('/api/speaker-foto', origin)
  url.searchParams.set('id', speaker.id)
  return url.toString()
}

export function redactEmails(value: string | null): string | null {
  if (!value) return value
  const next = value.replace(EMAIL_RE, '').replace(/[ \t]{2,}/g, ' ').trim()
  return next || null
}

function compareSesiones(a: RawSesion, b: RawSesion): number {
  return (
    a.fecha.localeCompare(b.fecha) ||
    a.horaInicio.localeCompare(b.horaInicio) ||
    a.escenario.nombre.localeCompare(b.escenario.nombre, 'es') ||
    a.titulo.localeCompare(b.titulo, 'es') ||
    a.id.localeCompare(b.id)
  )
}

function compareSpeakers(a: SpeakerPublico, b: SpeakerPublico): number {
  const rankA = ROL_RANK[a.rol] ?? 99
  const rankB = ROL_RANK[b.rol] ?? 99
  return rankA - rankB || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id)
}

function uniqueEvento(eventos: EventoPublico[]): EventoPublico | null {
  const ids = new Set(eventos.map((evento) => evento.id))
  if (ids.size !== 1) return null
  return eventos[0] ?? null
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function icsLocal(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso)
  if (!match) return ''
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}`
}

function icsDescription(sesion: SesionPublica): string {
  const parts: string[] = []
  if (sesion.formato) parts.push(`Formato: ${sesion.formato}`)
  if (sesion.track) parts.push(`Track: ${sesion.track}`)
  if (sesion.idioma) parts.push(`Idioma: ${sesion.idioma}`)
  if (sesion.descripcion) parts.push(sesion.descripcion)
  if (sesion.speakers.length > 0) {
    parts.push(
      'Speakers:\n' +
        sesion.speakers
          .map((speaker) => {
            const role = [speaker.cargo, speaker.empresa].filter(Boolean).join(', ')
            const suffix = role ? ` — ${role}` : ''
            return `- ${speaker.nombre} (${speaker.rol})${suffix}`
          })
          .join('\n'),
    )
  }
  return parts.join('\n\n')
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ''
  let currentBytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = out.length === 0 ? 75 : 74
    if (current && currentBytes + size > limit) {
      out.push(current)
      current = char
      currentBytes = size
    } else {
      current += char
      currentBytes += size
    }
  }
  if (current) out.push(current)
  return out.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n')
}
