const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

function partes(iso: string): [number, number, number] | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return [y, m, d]
}

/** "Mar, 15 Sep" */
export function formatDiaLargo(iso: string): string {
  const p = partes(iso)
  if (!p) return iso || '—'
  const [y, m, d] = p
  return `${DIAS[new Date(y, m - 1, d).getDay()]}, ${d} ${MESES[m - 1]}`
}

/** "Mar 15" */
export function formatDiaCorto(iso: string): string {
  const p = partes(iso)
  if (!p) return iso || '—'
  const [y, m, d] = p
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d}`
}

/** "09:00–09:45" (sin espacios) */
export function rangoHora(inicio: string, fin: string): string {
  if (!inicio || !fin) return '—'
  return `${inicio}–${fin}`
}

/** minutos desde medianoche para "HH:MM" o "HH:MM:SS" */
export function minutosDelDia(hora: string): number {
  const [h = '0', m = '0'] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

/** genera las fechas ISO entre inicio y fin (inclusive) */
export function diasEntre(inicio: string, fin: string): string[] {
  const a = partes(inicio)
  const b = partes(fin)
  if (!a || !b) return []
  const start = new Date(a[0], a[1] - 1, a[2])
  const end = new Date(b[0], b[1] - 1, b[2])
  if (end < start) return []
  const out: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`,
    )
  }
  return out
}
