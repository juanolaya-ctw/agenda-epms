/** Resultado interpretado de un DELETE de membresía (evento_speakers). */

export type MembershipDeleteResult =
  | { ok: true; deleted: number }
  | { ok: false; reason: 'error'; message: string }
  | { ok: false; reason: 'sin_filas' }

/**
 * Interpreta la respuesta de `.delete().select(...)` sobre una membresía.
 * - error de Supabase/Postgres → reason 'error' (p. ej. permission denied)
 * - 0 filas → reason 'sin_filas' (no había membresía o RLS no dejó ver/borrar)
 * - ≥1 fila → ok
 */
export function interpretMembershipDelete(input: {
  error: { message: string } | null
  data: unknown[] | null
}): MembershipDeleteResult {
  if (input.error) {
    return { ok: false, reason: 'error', message: input.error.message }
  }
  const deleted = input.data?.length ?? 0
  if (deleted === 0) {
    return { ok: false, reason: 'sin_filas' }
  }
  return { ok: true, deleted }
}

/** Mensaje de toast / Error para un delete de membresía fallido. */
export function membershipDeleteErrorMessage(
  result: Extract<MembershipDeleteResult, { ok: false }>,
): string {
  if (result.reason === 'sin_filas') {
    return 'No se borró ninguna membresía (0 filas). Puede que ya no estuviera asociada a este evento.'
  }
  return result.message
}

/** Interpreta un delete suelto (sin select): solo mira error. */
export function assertDeleteOk(
  label: string,
  error: { message: string } | null,
): void {
  if (error) {
    throw new Error(`${label}: ${error.message}`)
  }
}
