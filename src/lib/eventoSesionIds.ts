import { supabase } from '@/lib/supabase'

const CACHE_TTL_MS = 45_000

type CacheEntry = {
  ids: string[]
  expiresAt: number
}

const sesionIdsCache = new Map<string, CacheEntry>()

/**
 * Invalida el cache de sesionIds. Sin argumento, limpia todo.
 * Llamar tras mutar sesiones/slots del evento.
 */
export function invalidateSesionIdsCache(eventoId?: string): void {
  if (eventoId) {
    sesionIdsCache.delete(eventoId)
    return
  }
  sesionIdsCache.clear()
}

/**
 * Resuelve los ids de sesión pertenecientes a un evento
 * (escenarios → slots → sesiones). Cache en memoria con TTL 45s.
 */
export async function fetchSesionIdsForEvento(
  eventoId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const cached = sesionIdsCache.get(eventoId)
  if (cached && cached.expiresAt > Date.now()) {
    return { ids: cached.ids, error: null }
  }

  const { data: escenarios, error: escError } = await supabase
    .from('escenarios')
    .select('id')
    .eq('evento_id', eventoId)

  if (escError) return { ids: [], error: escError.message }

  const escenarioIds = (escenarios ?? []).map((row) => row.id as string)
  if (escenarioIds.length === 0) {
    sesionIdsCache.set(eventoId, {
      ids: [],
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
    return { ids: [], error: null }
  }

  const { data: slots, error: slotsError } = await supabase
    .from('slots')
    .select('id')
    .in('escenario_id', escenarioIds)

  if (slotsError) return { ids: [], error: slotsError.message }

  const slotIds = (slots ?? []).map((row) => row.id as string)
  if (slotIds.length === 0) {
    sesionIdsCache.set(eventoId, {
      ids: [],
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
    return { ids: [], error: null }
  }

  const { data: sesiones, error: sesionesError } = await supabase
    .from('sesiones')
    .select('id')
    .in('slot_id', slotIds)

  if (sesionesError) return { ids: [], error: sesionesError.message }

  const ids = (sesiones ?? []).map((row) => row.id as string)
  sesionIdsCache.set(eventoId, {
    ids,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  return { ids, error: null }
}
