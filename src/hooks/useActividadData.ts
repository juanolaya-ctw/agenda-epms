import {
  listarGestionesEventoSpeaker,
  listarGestionesSpeakerGlobal,
  type Gestion,
  type GestionConEvento,
} from '@/hooks/useGestionesData'
import { listarUsuariosAgenda } from '@/hooks/useSpeakersData'
import {
  parseOrigen,
  type GestionTimelineInput,
  type SpeakerCambio,
} from '@/lib/actividadTimeline'
import { isUuid } from '@/lib/isUuid'
import { supabase } from '@/lib/supabase'

const CAMBIO_COLS =
  'id, speaker_id, evento_id, ambito, campo, valor_anterior, valor_nuevo, origen, actor_id, tally_envio_id, created_at'

function mapCambioRow(row: Record<string, unknown>): SpeakerCambio {
  const ambitoRaw = String(row.ambito ?? '')
  const ambito =
    ambitoRaw === 'speaker' ||
    ambitoRaw === 'evento_speakers' ||
    ambitoRaw === 'merge'
      ? ambitoRaw
      : 'speaker'
  return {
    id: row.id as string,
    speaker_id: row.speaker_id as string,
    evento_id: (row.evento_id as string | null) ?? null,
    ambito,
    campo: String(row.campo ?? ''),
    valor_anterior: row.valor_anterior ?? null,
    valor_nuevo: row.valor_nuevo ?? null,
    origen: parseOrigen(String(row.origen ?? 'sistema')),
    actor_id: (row.actor_id as string | null) ?? null,
    tally_envio_id: (row.tally_envio_id as string | null) ?? null,
    created_at: row.created_at as string,
  }
}

/**
 * Historial automático del speaker (solo SELECT; lo escriben los triggers).
 * TODO: PostgREST limita ~1000 filas por defecto. Si un speaker supera ese
 * número de cambios, la timeline quedaría incompleta sin avisar. Valorar
 * paginación o RPC agregada cuando crezca el volumen.
 */
export async function listarCambiosSpeaker(
  speakerId: string,
): Promise<SpeakerCambio[]> {
  if (!isUuid(speakerId)) throw new Error('speakerId debe ser UUID')
  const { data, error } = await supabase
    .from('speaker_cambios')
    .select(CAMBIO_COLS)
    .eq('speaker_id', speakerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapCambioRow)
}

export async function listarNombresEventos(
  eventoIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(eventoIds.filter((id) => isUuid(id)))]
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const { data, error } = await supabase
    .from('eventos')
    .select('id, nombre')
    .in('id', ids)
  if (error) throw new Error(error.message)
  for (const row of data ?? []) {
    const id = (row as { id: string }).id
    const nombre = (row as { nombre: string | null }).nombre
    if (id) map.set(id, nombre?.trim() || 'Evento')
  }
  return map
}

function gestionATimeline(
  g: Gestion | GestionConEvento,
): GestionTimelineInput {
  return {
    id: g.id,
    evento_id: g.evento_id,
    tipo: g.tipo,
    nota: g.nota,
    ocurrida_at: g.ocurrida_at,
    proxima_at: g.proxima_at,
    creado_por: g.creado_por,
    created_at: g.created_at,
    eventoNombre: 'eventoNombre' in g ? g.eventoNombre : null,
  }
}

export type ActividadCarga = {
  cambios: SpeakerCambio[]
  gestiones: GestionTimelineInput[]
  nombresPorUsuario: Record<string, string>
  nombresEvento: Map<string, string>
}

/**
 * Carga cambios + gestiones + usuarios Agenda + nombres de eventos.
 * modo 'evento' con eventoId: gestiones del evento (el filtro UI estrecha cambios).
 * modo 'global': gestiones de todos los eventos.
 */
export async function cargarActividadSpeaker(opts: {
  speakerId: string
  modo: 'evento' | 'global'
  eventoId?: string
}): Promise<ActividadCarga> {
  const { speakerId, modo, eventoId } = opts
  if (!isUuid(speakerId)) throw new Error('speakerId debe ser UUID')

  const [cambios, gestionesRaw, usuarios] = await Promise.all([
    listarCambiosSpeaker(speakerId),
    modo === 'evento' && eventoId && isUuid(eventoId)
      ? listarGestionesEventoSpeaker(eventoId, speakerId)
      : listarGestionesSpeakerGlobal(speakerId),
    listarUsuariosAgenda().catch(() => []),
  ])

  const gestiones = gestionesRaw.map(gestionATimeline)
  const eventoIds = [
    ...cambios.map((c) => c.evento_id).filter((id): id is string => !!id),
    ...gestiones.map((g) => g.evento_id),
  ]
  const nombresEvento = await listarNombresEventos(eventoIds)

  const nombresPorUsuario: Record<string, string> = {}
  for (const u of usuarios) {
    if (u.nombre.trim()) nombresPorUsuario[u.id] = u.nombre.trim()
  }

  return { cambios, gestiones, nombresPorUsuario, nombresEvento }
}
