import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Speaker = {
  id: string
  nombre: string
  cargo: string | null
  empresa: string | null
  pais: string | null
  ciudad: string | null
  email: string | null
  telefono: string | null
  linkedin_url: string | null
  tipo_documento: string | null
  numero_documento: string | null
  email_secundario: string | null
  foto_url: string | null
  bio: string | null
  fuente: string | null
  sesionesEnEvento: number
  eventosParticipados: string[]
}

export type SpeakerEditable = {
  nombre: string
  cargo: string
  empresa: string
  pais: string
  ciudad: string
  email: string
  telefono: string
  linkedin_url: string
  tipo_documento: string
  numero_documento: string
  email_secundario: string
  bio: string
}

export type SpeakersData = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  loading: boolean
  error: string | null
  refetch: () => void
  actualizarSpeaker: (
    id: string,
    datos: Partial<SpeakerEditable>,
  ) => Promise<void>
}

export type ParticipacionSesion = {
  sesionId: string
  titulo: string
  dia: string
  horaInicio: string
  horaFin: string
  escenario: string
  rol: string
}

export type PropiedadCustom = {
  id: string
  nombre: string
  tipo: string // 'checklist' | 'texto' | 'select' | 'fecha'
  opciones: string[]
  orden: number | null
}

export type ChecklistItem = { label: string; checked: boolean }

function pick<T>(value: T | null | undefined): T | null {
  return value ?? null
}

// Los embeds a-uno de PostgREST llegan como objeto, pero supabase-js a veces
// los tipa como array; normalizamos.
function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

function mapSpeakerRow(
  r: Record<string, unknown>,
  extras: { sesionesEnEvento: number; eventosParticipados: string[] },
): Speaker {
  return {
    id: r.id as string,
    nombre: (r.nombre as string | null) ?? '',
    cargo: pick(r.cargo as string | null),
    empresa: pick(r.empresa as string | null),
    pais: pick(r.pais as string | null),
    ciudad: pick(r.ciudad as string | null),
    email: pick(r.email as string | null),
    telefono: pick(r.telefono as string | null),
    linkedin_url: pick(r.linkedin_url as string | null),
    tipo_documento: pick(r.tipo_documento as string | null),
    numero_documento: pick(r.numero_documento as string | null),
    email_secundario: pick(r.email_secundario as string | null),
    foto_url: pick(r.foto_url as string | null),
    bio: pick(r.bio as string | null),
    fuente: pick(r.fuente as string | null),
    sesionesEnEvento: extras.sesionesEnEvento,
    eventosParticipados: extras.eventosParticipados,
  }
}

async function eventoSesionIds(
  eventoId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const esc = await supabase
    .from('escenarios')
    .select('id')
    .eq('evento_id', eventoId)
  if (esc.error) return { ids: [], error: esc.error.message }
  const escIds = (esc.data ?? []).map((r) => r.id as string)
  if (escIds.length === 0) return { ids: [], error: null }

  const slots = await supabase
    .from('slots')
    .select('id')
    .in('escenario_id', escIds)
  if (slots.error) return { ids: [], error: slots.error.message }
  const slotIds = (slots.data ?? []).map((r) => r.id as string)
  if (slotIds.length === 0) return { ids: [], error: null }

  const ses = await supabase.from('sesiones').select('id').in('slot_id', slotIds)
  if (ses.error) return { ids: [], error: ses.error.message }
  return { ids: (ses.data ?? []).map((r) => r.id as string), error: null }
}

type LoadResult = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  error: string | null
}

async function loadSpeakers(eventoId: string): Promise<LoadResult> {
  const empty = { propiedades: [] as PropiedadCustom[], valoresPorSpeaker: {} }
  const spRes = await supabase.from('speakers').select('*').order('nombre')
  if (spRes.error) return { speakers: [], ...empty, error: spRes.error.message }
  const rows = spRes.data ?? []

  const graph = await eventoSesionIds(eventoId)
  const countBySpeaker = new Map<string, number>()
  if (!graph.error && graph.ids.length > 0) {
    const ssRes = await supabase
      .from('sesion_speakers')
      .select('speaker_id, sesion_id')
      .in('sesion_id', graph.ids)
    if (!ssRes.error) {
      const setBySpeaker = new Map<string, Set<string>>()
      for (const r of ssRes.data ?? []) {
        const sid = r.speaker_id as string
        if (!setBySpeaker.has(sid)) setBySpeaker.set(sid, new Set())
        setBySpeaker.get(sid)!.add(r.sesion_id as string)
      }
      for (const [sid, set] of setBySpeaker) countBySpeaker.set(sid, set.size)
    }
  }

  const speakers: Speaker[] = rows.map((r) =>
    mapSpeakerRow(r as Record<string, unknown>, {
      sesionesEnEvento: countBySpeaker.get(r.id as string) ?? 0,
      eventosParticipados: [],
    }),
  )

  // Propiedades custom del evento (columnas globales) + valores de todos los speakers
  const props = await propiedadesSpeaker(eventoId)
  const valoresPorSpeaker: Record<string, Record<string, unknown>> = {}
  if (!props.error && props.data.length > 0) {
    const vpRes = await supabase
      .from('valores_propiedades')
      .select('speaker_id, propiedad_id, valor')
      .in(
        'propiedad_id',
        props.data.map((p) => p.id),
      )
    if (!vpRes.error) {
      for (const r of vpRes.data ?? []) {
        const sid = r.speaker_id as string | null
        if (!sid) continue
        if (!valoresPorSpeaker[sid]) valoresPorSpeaker[sid] = {}
        valoresPorSpeaker[sid][r.propiedad_id as string] = r.valor
      }
    }
  }

  return {
    speakers,
    propiedades: props.data,
    valoresPorSpeaker,
    error: graph.error ?? props.error,
  }
}

type EventoNombreEmbed = { nombre: string | null }
type EscenarioEventoEmbed = {
  evento: EventoNombreEmbed | EventoNombreEmbed[] | null
}
type SlotEventoEmbed = {
  escenario: EscenarioEventoEmbed | EscenarioEventoEmbed[] | null
}
type SesionEventoEmbed = { slot: SlotEventoEmbed | SlotEventoEmbed[] | null }
type SesionSpeakerEventoRel = {
  sesion: SesionEventoEmbed | SesionEventoEmbed[] | null
}
type SpeakerGlobalRow = Record<string, unknown> & {
  id: string
  sesion_speakers?: SesionSpeakerEventoRel[] | null
}

const SPEAKERS_GLOBAL_SELECT = `
  *,
  sesion_speakers (
    sesion:sesiones (
      slot:slots (
        escenario:escenarios (
          evento:eventos ( nombre )
        )
      )
    )
  )
`

// Una sola query embebida: speakers + todas sus participaciones con el
// nombre del evento, en vez de reconstruir el grafo a mano en 6 pasos.
async function loadSpeakersGlobal(): Promise<LoadResult> {
  const empty = { propiedades: [] as PropiedadCustom[], valoresPorSpeaker: {} }
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKERS_GLOBAL_SELECT)
    .order('nombre')

  if (error) return { speakers: [], ...empty, error: error.message }

  const speakers: Speaker[] = ((data ?? []) as SpeakerGlobalRow[]).map((r) => {
    const rels = Array.isArray(r.sesion_speakers) ? r.sesion_speakers : []
    const eventos = new Set<string>()
    for (const rel of rels) {
      const sesion = one(rel.sesion)
      const slot = one(sesion?.slot)
      const escenario = one(slot?.escenario)
      const evento = one(escenario?.evento)
      const nombre = evento?.nombre
      if (nombre) eventos.add(nombre)
    }
    return mapSpeakerRow(r as unknown as Record<string, unknown>, {
      sesionesEnEvento: rels.length,
      eventosParticipados: [...eventos].sort(),
    })
  })

  return { speakers, ...empty, error: null }
}

export async function actualizarSpeaker(
  id: string,
  datos: Partial<SpeakerEditable>,
): Promise<void> {
  const { error } = await supabase.from('speakers').update(datos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function crearSpeaker(
  datos: Partial<SpeakerEditable>,
): Promise<string> {
  const { data, error } = await supabase
    .from('speakers')
    .insert({ ...datos, fuente: 'admin_manual' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

type EscenarioNombreEmbed = { nombre: string | null; evento_id: string }
type SlotPartEmbed = {
  dia: string | null
  hora_inicio: string | null
  hora_fin: string | null
  escenario: EscenarioNombreEmbed | EscenarioNombreEmbed[] | null
}
type SesionPartEmbed = {
  id: string
  titulo: string | null
  slot: SlotPartEmbed | SlotPartEmbed[] | null
}
type SesionSpeakerPartRow = {
  rol: string | null
  sesion: SesionPartEmbed | SesionPartEmbed[] | null
}

const SESIONES_DE_SPEAKER_SELECT = `
  rol,
  sesion:sesiones!inner (
    id, titulo,
    slot:slots!inner (
      dia, hora_inicio, hora_fin,
      escenario:escenarios!inner ( nombre, evento_id )
    )
  )
`

// Una sola query embebida filtrada por evento en el servidor, en vez de la
// cascada sesion_speakers → sesiones → slots → escenarios.
export async function sesionesDeSpeaker(
  speakerId: string,
  eventoId: string,
): Promise<{ data: ParticipacionSesion[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sesion_speakers')
    .select(SESIONES_DE_SPEAKER_SELECT)
    .eq('speaker_id', speakerId)
    .eq('sesion.slot.escenario.evento_id', eventoId)

  if (error) return { data: [], error: error.message }

  const parts: ParticipacionSesion[] = ((data ?? []) as SesionSpeakerPartRow[])
    .map((row) => {
      const sesion = one(row.sesion)
      const slot = one(sesion?.slot)
      const escenario = one(slot?.escenario)
      return {
        sesionId: sesion?.id ?? '',
        titulo: sesion?.titulo ?? '',
        dia: slot?.dia ?? '',
        horaInicio: (slot?.hora_inicio ?? '').slice(0, 5),
        horaFin: (slot?.hora_fin ?? '').slice(0, 5),
        escenario: escenario?.nombre ?? '',
        rol: row.rol ?? '',
      }
    })
  return { data: parts, error: null }
}

export async function propiedadesSpeaker(
  eventoId: string,
): Promise<{ data: PropiedadCustom[]; error: string | null }> {
  const res = await supabase
    .from('propiedades_custom')
    .select('*')
    .eq('entidad', 'speaker')
    .eq('evento_id', eventoId)
    .order('orden')
  if (res.error) return { data: [], error: res.error.message }
  return {
    data: (res.data ?? []).map((r) => ({
      id: r.id as string,
      nombre: (r.nombre as string | null) ?? '',
      tipo: (r.tipo as string | null) ?? 'texto',
      opciones: Array.isArray(r.opciones) ? (r.opciones as string[]) : [],
      orden: (r.orden as number | null) ?? null,
    })),
    error: null,
  }
}

export async function valoresSpeaker(
  speakerId: string,
  propiedadIds: string[],
): Promise<{ data: Record<string, unknown>; error: string | null }> {
  if (propiedadIds.length === 0) return { data: {}, error: null }
  const res = await supabase
    .from('valores_propiedades')
    .select('propiedad_id, valor')
    .eq('speaker_id', speakerId)
    .in('propiedad_id', propiedadIds)
  if (res.error) return { data: {}, error: res.error.message }
  const map: Record<string, unknown> = {}
  for (const r of res.data ?? []) map[r.propiedad_id as string] = r.valor
  return { data: map, error: null }
}

export async function guardarValorPropiedad(
  speakerId: string,
  propiedadId: string,
  valor: unknown,
): Promise<void> {
  const existing = await supabase
    .from('valores_propiedades')
    .select('id')
    .eq('speaker_id', speakerId)
    .eq('propiedad_id', propiedadId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const { error } = await supabase
      .from('valores_propiedades')
      .update({ valor })
      .eq('id', existing.data.id as string)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('valores_propiedades')
      .insert({ speaker_id: speakerId, propiedad_id: propiedadId, valor })
    if (error) throw new Error(error.message)
  }
}

export async function crearPropiedad(
  eventoId: string,
  nombre: string,
  tipo: string,
): Promise<void> {
  const { error } = await supabase.from('propiedades_custom').insert({
    evento_id: eventoId,
    entidad: 'speaker',
    nombre,
    tipo,
  })
  if (error) throw new Error(error.message)
}

export async function renombrarPropiedad(
  id: string,
  nombre: string,
): Promise<void> {
  const { error } = await supabase
    .from('propiedades_custom')
    .update({ nombre })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminarPropiedad(id: string): Promise<void> {
  // Los valores dependen de la propiedad (FK); se borran primero.
  await supabase.from('valores_propiedades').delete().eq('propiedad_id', id)
  const { error } = await supabase
    .from('propiedades_custom')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

type State = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  loading: boolean
  error: string | null
}

const EMPTY_STATE: Omit<State, 'loading'> = {
  speakers: [],
  propiedades: [],
  valoresPorSpeaker: {},
  error: null,
}

export function useSpeakersData(
  eventoId: string | null | undefined,
  options?: { global?: boolean },
): SpeakersData {
  const global = options?.global === true
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<State>({
    ...EMPTY_STATE,
    loading: global || Boolean(eventoId),
  })

  const refetch = useCallback(() => setTick((v) => v + 1), [])

  useEffect(() => {
    if (!global && !eventoId) {
      setState({ ...EMPTY_STATE, loading: false })
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const loader = global
      ? loadSpeakersGlobal()
      : loadSpeakers(eventoId as string)
    loader.then((next) => {
      if (!cancelled) setState({ ...next, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [eventoId, global, tick])

  const actualizar = useCallback(
    async (id: string, datos: Partial<SpeakerEditable>) => {
      await actualizarSpeaker(id, datos)
      setTick((v) => v + 1)
    },
    [],
  )

  return { ...state, refetch, actualizarSpeaker: actualizar }
}
