/**
 * Misma paleta de respaldo que el calendario interno
 * (`COLORES_ESCENARIO` en src/hooks/useSesionesData.ts).
 * El índice es la posición del escenario ordenado por nombre dentro del evento.
 */
export const COLORES_ESCENARIO_PALETTE = [
  '#0093FF',
  '#FFEDB5',
  '#EE82EE',
  '#42B3F3',
  '#16A34A',
  '#F97316',
  '#0F766E',
  '#BE123C',
] as const

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

export function normalizarColorEscenario(
  value: unknown,
  indexFallback = 0,
): string {
  if (typeof value === 'string' && HEX_COLOR_RE.test(value)) return value
  const index = Math.abs(indexFallback) % COLORES_ESCENARIO_PALETTE.length
  return COLORES_ESCENARIO_PALETTE[index]
}
