import {
  ESTADO_ALTA_NUEVA,
  isEventoSpeakerEstado,
  type EventoSpeakerEstado,
} from '@/lib/eventoSpeakerEstado'
import {
  isValidSpeakerEmail,
  normalizeSpeakerEmail,
} from '@/lib/speakerEmail'
import type { AvisoImport } from './tipos'

/**
 * Paridad con epms.normalizar_texto_match(text):
 * translate tildes/ñ → ASCII, lower, puntuación→espacio, colapsar espacios, trim.
 * Vacío → null.
 */
const TRANSLATE_FROM =
  'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç'
const TRANSLATE_TO =
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'

const TRANSLATE_MAP = (() => {
  const m = new Map<string, string>()
  for (let i = 0; i < TRANSLATE_FROM.length; i++) {
    m.set(TRANSLATE_FROM[i]!, TRANSLATE_TO[i]!)
  }
  return m
})()

export function normalizarTextoMatch(
  value: string | null | undefined,
): string | null {
  if (value == null) return null
  let out = ''
  for (const ch of value) {
    out += TRANSLATE_MAP.get(ch) ?? ch
  }
  out = out
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return out === '' ? null : out
}

export function normalizarNombre(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  const s = String(value).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

export function textoONull(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'boolean') return null
  if (typeof value === 'number') return String(value)
  const s = String(value).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

export function parseBoolCelda(value: unknown): boolean | null {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  const s = String(value).trim().toLowerCase()
  if (!s) return null
  if (['sí', 'si', 'yes', 'y', 'true', '1', 'x', '✓', '✔'].includes(s))
    return true
  if (['no', 'n', 'false', '0'].includes(s)) return false
  return null
}

/** True si el Date es «solo fecha» (medianoche UTC o local). */
function esMedianocheSoloFecha(d: Date): boolean {
  return (
    (d.getUTCHours() === 0 &&
      d.getUTCMinutes() === 0 &&
      d.getUTCSeconds() === 0 &&
      d.getUTCMilliseconds() === 0) ||
    (d.getHours() === 0 &&
      d.getMinutes() === 0 &&
      d.getSeconds() === 0 &&
      d.getMilliseconds() === 0)
  )
}

/**
 * Normaliza fechas a YYYY-MM-DD (día civil).
 * Acepta Date, serial Excel (días desde 1899-12-30), ISO, DD/MM/YYYY, DD-MM-YYYY.
 *
 * SheetJS cellDates entrega medianoche UTC (p.ej. 2026-10-15T00:00:00.000Z).
 * En America/Bogota eso es el día anterior con getters locales → usamos UTC
 * cuando es solo-fecha.
 */
export function parseFechaYmd(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (esMedianocheSoloFecha(value)) {
      const y = value.getUTCFullYear()
      const m = String(value.getUTCMonth() + 1).padStart(2, '0')
      const d = String(value.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30)
    const ms = epoch + Math.round(value) * 86400000
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = String(value).trim()
  if (!s) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slashYmd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s)
  if (slashYmd) {
    return `${slashYmd[1]}-${slashYmd[2]!.padStart(2, '0')}-${slashYmd[3]!.padStart(2, '0')}`
  }

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`
  }

  const parsed = Date.parse(s)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    if (esMedianocheSoloFecha(d) || /T00:00:00(\.0+)?Z$/i.test(s)) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return null
}

/** Aviso si la fecha cae fuera del rango operativo (se importa igual). */
export function avisoFechaSospechosa(
  ymd: string,
  hoyYmd?: string,
): { codigo: string; mensaje: string } | null {
  if (ymd < '2026-01-01') {
    return {
      codigo: 'fecha_sospechosa',
      mensaje: `Fecha ${ymd} anterior a 2026-01-01; se importa igual`,
    }
  }
  const hoy =
    hoyYmd ??
    (() => {
      const n = new Date()
      return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`
    })()
  if (ymd > hoy) {
    return {
      codigo: 'fecha_sospechosa',
      mensaje: `Fecha ${ymd} posterior a hoy (${hoy}); se importa igual`,
    }
  }
  return null
}

type EstadoRule = {
  /** Prefijo o igualdad tras normalizarTextoMatch. */
  match: (norm: string) => boolean
  estado: EventoSpeakerEstado
  /** Si true, guarda el texto original en estado_motivo. */
  guardarMotivo: boolean
  fuerzaViaticos?: boolean
}

const ESTADO_RULES: EstadoRule[] = [
  {
    match: (n) => n === 'no enviado',
    estado: 'PENDIENTE_CONTACTAR',
    guardarMotivo: false,
  },
  {
    match: (n) => n === 'enviado',
    estado: 'CONTACTADO',
    guardarMotivo: false,
  },
  {
    match: (n) =>
      n === 'no respondio' ||
      n === 'no se pudo enviar' ||
      n.startsWith('invitacion enviada') ||
      n === 'pendiente follow up',
    estado: 'CONTACTADO',
    guardarMotivo: true,
  },
  {
    match: (n) => n === 'en conversacion',
    estado: 'EN_CONVERSACION',
    guardarMotivo: false,
  },
  {
    match: (n) => n === 'confirmo pero quiere viaticos',
    estado: 'CONFIRMADO',
    guardarMotivo: true,
    fuerzaViaticos: true,
  },
  {
    match: (n) => n === 'confirmo',
    estado: 'CONFIRMADO',
    guardarMotivo: false,
  },
  {
    match: (n) => n === 'no puede',
    estado: 'NO_DISPONIBLE',
    guardarMotivo: false,
  },
  {
    match: (n) =>
      n === 'descartado x viaticos' ||
      n === 'despriorizado' ||
      n === 'no aplica' ||
      n.startsWith('no aplica y') ||
      n === 'patrocinador',
    estado: 'DESCARTADO',
    guardarMotivo: true,
  },
]

export type EstadoNormalizado = {
  estado: EventoSpeakerEstado
  motivo: string | null
  raw: string | null
  fuerzaViaticos: boolean
  aviso: AvisoImport | null
}

export function mapearEstadoExcel(
  raw: unknown,
  /**
   * Si no hay columna Estado mapeada, el caller pasa el default de UI
   * (PENDIENTE_CONTACTAR). Si la celda está vacía → SIN_CLASIFICAR.
   */
  opciones?: { sinColumnaEstado?: boolean; defaultEstado?: EventoSpeakerEstado },
): EstadoNormalizado {
  if (opciones?.sinColumnaEstado) {
    return {
      estado: opciones.defaultEstado ?? ESTADO_ALTA_NUEVA,
      motivo: null,
      raw: null,
      fuerzaViaticos: false,
      aviso: null,
    }
  }
  if (raw == null || String(raw).trim() === '') {
    return {
      estado: 'SIN_CLASIFICAR',
      motivo: null,
      raw: null,
      fuerzaViaticos: false,
      aviso: null,
    }
  }
  const original = String(raw).trim()
  if (isEventoSpeakerEstado(original)) {
    return {
      estado: original,
      motivo: null,
      raw: original,
      fuerzaViaticos: false,
      aviso: null,
    }
  }
  const key = normalizarTextoMatch(original) ?? ''
  for (const rule of ESTADO_RULES) {
    if (rule.match(key)) {
      return {
        estado: rule.estado,
        motivo: rule.guardarMotivo ? original : null,
        raw: original,
        fuerzaViaticos: rule.fuerzaViaticos === true,
        aviso: null,
      }
    }
  }
  return {
    estado: 'SIN_CLASIFICAR',
    motivo: original.slice(0, 500),
    raw: original,
    fuerzaViaticos: false,
    aviso: {
      codigo: 'estado_desconocido',
      mensaje: `Estado «${original}» no reconocido; se usa SIN_CLASIFICAR y se guarda como motivo`,
    },
  }
}

export type EmailNormalizado = {
  email: string | null
  aprobado: boolean
  aviso: AvisoImport | null
}

/**
 * Email: normaliza; inválido → null + aviso (no bloquea fila).
 * Aprobado=true solo si es válido (permite fill-empty en actualizar).
 */
export function normalizarEmailImport(raw: unknown): EmailNormalizado {
  if (raw == null || String(raw).trim() === '') {
    return { email: null, aprobado: false, aviso: null }
  }
  if (typeof raw === 'boolean' || typeof raw === 'number') {
    return {
      email: null,
      aprobado: false,
      aviso: {
        codigo: 'email_invalido',
        mensaje: `Email inválido «${String(raw)}»; se ignora`,
      },
    }
  }
  const original = String(raw).trim()
  const normalized = normalizeSpeakerEmail(original)
  if (!isValidSpeakerEmail(normalized) || normalized == null) {
    return {
      email: null,
      aprobado: false,
      aviso: {
        codigo: 'email_invalido',
        mensaje: `Email inválido «${original}»; se ignora`,
      },
    }
  }
  return { email: normalized, aprobado: true, aviso: null }
}

/** Detecta si un valor parece URL de LinkedIn / http. */
export function pareceLinkedinUrl(value: unknown): boolean {
  if (value == null || typeof value === 'boolean' || typeof value === 'number')
    return false
  const s = String(value).trim().toLowerCase()
  if (!s) return false
  return (
    s.includes('linkedin.com') ||
    s.startsWith('http://') ||
    s.startsWith('https://')
  )
}
