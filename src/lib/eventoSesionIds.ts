import { supabase } from '@/lib/supabase'

/**
 * Resuelve los ids de sesión pertenecientes a un evento
 * (escenarios → slots → sesiones).
 */
export async function fetchSesionIdsForEvento(
  eventoId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data: escenarios, error: escError } = await supabase
    .from('escenarios')
    .select('id')
    .eq('evento_id', eventoId)

  if (escError) return { ids: [], error: escError.message }

  const escenarioIds = (escenarios ?? []).map((row) => row.id as string)
  if (escenarioIds.length === 0) return { ids: [], error: null }

  const { data: slots, error: slotsError } = await supabase
    .from('slots')
    .select('id')
    .in('escenario_id', escenarioIds)

  if (slotsError) return { ids: [], error: slotsError.message }

  const slotIds = (slots ?? []).map((row) => row.id as string)
  if (slotIds.length === 0) return { ids: [], error: null }

  const { data: sesiones, error: sesionesError } = await supabase
    .from('sesiones')
    .select('id')
    .in('slot_id', slotIds)

  if (sesionesError) return { ids: [], error: sesionesError.message }

  return {
    ids: (sesiones ?? []).map((row) => row.id as string),
    error: null,
  }
}
