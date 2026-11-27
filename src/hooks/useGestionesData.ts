import {
  armarPayloadRegistrarGestion,
  type RegistrarGestionInput,
} from '@/lib/gestionForm'
import {
  ultimaGestionPorSpeaker,
  type UltimaGestionResumen,
} from '@/lib/gestionResumen'
import { isGestionTipo, type GestionTipo } from '@/lib/gestionTipos'
import { isUuid } from '@/lib/isUuid'
import { supabase } from '@/lib/supabase'

export type Gestion = {
  id: string
  evento_id: string
  speaker_id: string
  tipo: GestionTipo
  nota: string | null
  ocurrida_at: string
  proxima_at: string | null
  creado_por: string | null
  created_at: string
}

export type GestionConEvento = Gestion & {
  eventoNombre: string | null
}

function mapGestionRow(row: Record<string, unknown>): Gestion {
  const tipoRaw = String(row.tipo ?? '')
  if (!isGestionTipo(tipoRaw)) {
    throw new Error(`Tipo de gestión desconocido: ${tipoRaw}`)
  }
  return {
    id: row.id as string,
    evento_id: row.evento_id as string,
    speaker_id: row.speaker_id as string,
    tipo: tipoRaw,
    nota: (row.nota as string | null) ?? null,
    ocurrida_at: row.ocurrida_at as string,
    proxima_at: (row.proxima_at as string | null) ?? null,
    creado_por: (row.creado_por as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

const GESTION_COLS =
  'id, evento_id, speaker_id, tipo, nota, ocurrida_at, proxima_at, creado_por, created_at'

export async function listarGestionesEventoSpeaker(
  eventoId: string,
  speakerId: string,
): Promise<Gestion[]> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const { data, error } = await supabase
    .from('evento_speaker_gestiones')
    .select(GESTION_COLS)
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
    .order('ocurrida_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapGestionRow)
}

export async function listarGestionesSpeakerGlobal(
  speakerId: string,
): Promise<GestionConEvento[]> {
  if (!isUuid(speakerId)) throw new Error('speakerId debe ser UUID')
  const { data, error } = await supabase
    .from('evento_speaker_gestiones')
    .select(
      `${GESTION_COLS}, evento:eventos ( id, nombre )`,
    )
    .eq('speaker_id', speakerId)
    .order('ocurrida_at', { ascending: false })
  if (error) throw new Error(error.message)

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const base = mapGestionRow(row)
    const eventoRel = row.evento as
      | { id: string; nombre: string | null }
      | { id: string; nombre: string | null }[]
      | null
    const evento = Array.isArray(eventoRel) ? eventoRel[0] : eventoRel
    return {
      ...base,
      eventoNombre: evento?.nombre ?? null,
    }
  })
}

/** Una sola query por evento; reduce a la última por speaker en cliente. */
export async function listarUltimasGestionesEvento(
  eventoId: string,
): Promise<Map<string, UltimaGestionResumen>> {
  if (!isUuid(eventoId)) throw new Error('eventoId debe ser UUID')
  const { data, error } = await supabase
    .from('evento_speaker_gestiones')
    .select('speaker_id, tipo, ocurrida_at')
    .eq('evento_id', eventoId)
    .order('ocurrida_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ultimaGestionPorSpeaker(
    ((data ?? []) as { speaker_id: string; tipo: string; ocurrida_at: string }[]),
  )
}

export async function registrarGestion(
  eventoId: string,
  speakerId: string,
  input: RegistrarGestionInput,
): Promise<Gestion> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const payload = armarPayloadRegistrarGestion(input)
  const { data, error } = await supabase.rpc('registrar_gestion', {
    p_evento_id: eventoId,
    p_speaker_id: speakerId,
    p_tipo: payload.tipo,
    p_nota: payload.nota,
    p_ocurrida_at: payload.ocurrida_at,
    p_proxima_at: payload.proxima_at,
    p_proxima_nota: payload.proxima_nota,
    p_marcar_contactado: payload.marcar_contactado,
  })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object') {
    throw new Error('La RPC no devolvió la gestión')
  }
  return mapGestionRow(data as Record<string, unknown>)
}
