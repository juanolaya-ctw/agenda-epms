/** Fechas civiles de prospección en America/Bogota (UTC−05, sin DST). */

export const BOGOTA_TZ = 'America/Bogota'
/** Offset fijo respecto a UTC (Bogotá no usa horario de verano). */
export const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export type Ymd = string

/** Partes civiles YYYY-MM-DD en America/Bogota para un instante. */
export function ymdBogota(ref: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) throw new Error('No se pudo formatear la fecha en Bogotá')
  return `${y}-${m}-${d}`
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const match = YMD_RE.exec(ymd.trim())
  if (!match) throw new Error(`Fecha civil inválida: ${ymd}`)
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/**
 * Inicio del día civil Bogotá (00:00:00.000−05:00) como Date UTC.
 * "28 nov" no se corre a otro día por UTC.
 */
export function inicioDiaBogota(ymdOrRef: Ymd | Date = new Date()): Date {
  const ymd = typeof ymdOrRef === 'string' ? ymdOrRef : ymdBogota(ymdOrRef)
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0))
}

/** Fin del día civil Bogotá (23:59:59.999−05:00) como Date UTC. */
export function finDiaBogota(ymdOrRef: Ymd | Date = new Date()): Date {
  const ymd = typeof ymdOrRef === 'string' ? ymdOrRef : ymdBogota(ymdOrRef)
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d, 5 + 23, 59, 59, 999))
}

/**
 * Guarda un YYYY-MM-DD del date picker como timestamptz = mediodía Bogotá.
 * Así el día civil se conserva al redondear en cualquier zona.
 */
export function ymdATimestampBogota(ymd: string): string {
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d, 5 + 12, 0, 0, 0)).toISOString()
}

/** Timestamptz → YYYY-MM-DD civil Bogotá para el input date. */
export function timestampAYmdBogota(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return ymdBogota(d)
}

/** proximo_seguimiento_at ≤ fin del día de hoy en Bogotá. */
export function esPendienteHoy(
  proximoSeguimientoAt: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!proximoSeguimientoAt) return false
  const t = new Date(proximoSeguimientoAt)
  if (Number.isNaN(t.getTime())) return false
  return t.getTime() <= finDiaBogota(ahora).getTime()
}

/** proximo_seguimiento_at < inicio del día de hoy en Bogotá. */
export function esVencido(
  proximoSeguimientoAt: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!proximoSeguimientoAt) return false
  const t = new Date(proximoSeguimientoAt)
  if (Number.isNaN(t.getTime())) return false
  return t.getTime() < inicioDiaBogota(ahora).getTime()
}
