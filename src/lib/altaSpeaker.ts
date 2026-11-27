/**
 * Alta de una persona en el pool global o en un evento.
 *
 * Toda membresía apunta a un speakers.id que ya existe (o que el caller
 * inserta en speakers antes de asociar). No hay camino que cree
 * evento_speakers sin esa fila global.
 * - crear: el caller inserta en speakers y, si el alta es del evento, asocia.
 * - asociar_existente: el email ya está en el pool; se reutiliza el id.
 * - abrir_existente: igual, pero el CRM no asocia a un evento: abre la ficha.
 */
export type PlanAltaSpeaker =
  | { tipo: 'crear' }
  | { tipo: 'asociar_existente'; speakerId: string }
  | { tipo: 'abrir_existente'; speakerId: string }

export function planAltaSpeaker(opts: {
  existenteId: string | null
  asociarAlEvento: boolean
}): PlanAltaSpeaker {
  if (!opts.existenteId) return { tipo: 'crear' }
  if (opts.asociarAlEvento) {
    return { tipo: 'asociar_existente', speakerId: opts.existenteId }
  }
  return { tipo: 'abrir_existente', speakerId: opts.existenteId }
}
