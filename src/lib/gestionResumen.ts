import type { GestionTipo } from '@/lib/gestionTipos'

export type UltimaGestionResumen = {
  speaker_id: string
  tipo: GestionTipo
  ocurrida_at: string
}

/**
 * De una lista ya ordenada por ocurrida_at DESC (o no), toma la más reciente
 * por speaker. Si hay empate de timestamp, se queda con la primera vista.
 */
export function ultimaGestionPorSpeaker(
  rows: ReadonlyArray<{
    speaker_id: string
    tipo: string
    ocurrida_at: string
  }>,
): Map<string, UltimaGestionResumen> {
  const map = new Map<string, UltimaGestionResumen>()
  for (const row of rows) {
    const prev = map.get(row.speaker_id)
    if (
      !prev ||
      new Date(row.ocurrida_at).getTime() > new Date(prev.ocurrida_at).getTime()
    ) {
      map.set(row.speaker_id, {
        speaker_id: row.speaker_id,
        tipo: row.tipo as GestionTipo,
        ocurrida_at: row.ocurrida_at,
      })
    }
  }
  return map
}

/** true si el speaker no tiene ninguna gestión en el mapa. */
export function filaSinGestiones(
  speakerId: string,
  map: ReadonlyMap<string, UltimaGestionResumen>,
): boolean {
  return !map.has(speakerId)
}
