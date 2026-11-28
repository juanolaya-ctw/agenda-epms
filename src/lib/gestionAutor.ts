/**
 * Autor visible de una gestión.
 * - Con usuario → su nombre (o «Equipo» si no está en el mapa)
 * - Sin usuario + tally_envio_id → «Tally»
 * - Sin usuario ni envío → «Sistema»
 */
export function autorGestion(
  creadoPor: string | null | undefined,
  tallyEnvioId: string | null | undefined,
  nombres: Readonly<Record<string, string>>,
): string {
  if (creadoPor) {
    const n = nombres[creadoPor]?.trim()
    return n || 'Equipo'
  }
  if (tallyEnvioId) return 'Tally'
  return 'Sistema'
}
