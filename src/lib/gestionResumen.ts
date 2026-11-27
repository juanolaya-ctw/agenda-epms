import type { GestionTipo } from '@/lib/gestionTipos'

export type UltimaGestionResumen = {
  speaker_id: string
  tipo: GestionTipo
  ocurrida_at: string
  created_at?: string | null
}

type GestionResumenRow = {
  speaker_id: string
  tipo: string
  ocurrida_at: string
  created_at?: string | null
}

function esMasReciente(a: GestionResumenRow, b: UltimaGestionResumen): boolean {
  const ta = new Date(a.ocurrida_at).getTime()
  const tb = new Date(b.ocurrida_at).getTime()
  if (ta !== tb) return ta > tb
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0
  return ca > cb
}

/**
 * Toma la más reciente por speaker.
 * Desempate: ocurrida_at DESC, luego created_at DESC.
 */
export function ultimaGestionPorSpeaker(
  rows: ReadonlyArray<GestionResumenRow>,
): Map<string, UltimaGestionResumen> {
  const map = new Map<string, UltimaGestionResumen>()
  for (const row of rows) {
    const prev = map.get(row.speaker_id)
    if (!prev || esMasReciente(row, prev)) {
      map.set(row.speaker_id, {
        speaker_id: row.speaker_id,
        tipo: row.tipo as GestionTipo,
        ocurrida_at: row.ocurrida_at,
        created_at: row.created_at ?? null,
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
