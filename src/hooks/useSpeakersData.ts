import { useCallback, useEffect, useState } from 'react'
import { isUuid } from '@/lib/isUuid'
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
  toolkit_slug: string | null
  sesionesEnEvento: number
  /** Nombres de eventos (membresía), para búsqueda/filtros. */
  eventosParticipados: string[]
  /** Membresía evento_speakers con id para asociar desde CRM. */
  eventosAsociados: { id: string; nombre: string }[]
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
  tipo: string // 'checklist' | 'texto' | 'select' | 'fecha' | 'checkbox'
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
  extras: {
    sesionesEnEvento: number
    eventosParticipados: string[]
    eventosAsociados?: { id: string; nombre: string }[]
  },
): Speaker {
  const eventosAsociados = extras.eventosAsociados ?? []
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
    toolkit_slug: pick(r.toolkit_slug as string | null),
    sesionesEnEvento: extras.sesionesEnEvento,
    eventosParticipados:
      extras.eventosParticipados.length > 0
        ? extras.eventosParticipados
        : eventosAsociados.map((e) => e.nombre),
    eventosAsociados,
  }
}

type LoadResult = {
  speakers: Speaker[]
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  error: string | null
}

// #6 (propiedades) → #7 (valores) siguen encadenadas entre sí (valores
// necesita los ids de propiedades), pero ya no dependen de la query de
// speakers, así que corren en paralelo con ella (Promise.all).
async function loadPropiedadesYValores(eventoId: string): Promise<{
  propiedades: PropiedadCustom[]
  valoresPorSpeaker: Record<string, Record<string, unknown>>
  error: string | null
}> {
  const props = await propiedadesSpeaker(eventoId)
  if (props.error) {
    return { propiedades: [], valoresPorSpeaker: {}, error: props.error }
  }

  const valoresPorSpeaker: Record<string, Record<string, unknown>> = {}
  if (props.data.length > 0) {
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

  return { propiedades: props.data, valoresPorSpeaker, error: null }
}

type EscenarioEventoIdEmbed = { evento_id: string }
type SlotEscEmbed = {
  escenario: EscenarioEventoIdEmbed | EscenarioEventoIdEmbed[] | null
}
type SesionSlotEmbed = { slot: SlotEscEmbed | SlotEscEmbed[] | null }
type SesionSpeakerTablaRel = {
  sesion: SesionSlotEmbed | SesionSlotEmbed[] | null
}
type SpeakerTablaRow = Record<string, unknown> & {
  id: string
  sesion_speakers?: SesionSpeakerTablaRel[] | null
}

// Columnas de speaker que pintan SpeakersTable / CrmGlobal. `bio` y las
// piezas (link_pieza_*, estado_pieza) NO se traen aquí: solo viven en el
// modal, que hace su propio point-lookup por PK.
const SPEAKER_COLS =
  'id, foto_url, nombre, cargo, empresa, pais, email, fuente, toolkit_slug, ' +
  'telefono, linkedin_url, ciudad, tipo_documento, numero_documento, email_secundario'

// Speakers asociados a ESTE evento (membresía evento_speakers).
// sesion_speakers sin !inner: cuentan sesiones pero no excluyen a nadie.
// El directorio global sigue en loadSpeakersGlobal / CRM.
const SPEAKERS_TABLA_SELECT = `
  ${SPEAKER_COLS},
  evento_speakers!inner ( evento_id ),
  sesion_speakers (
    sesion:sesiones (
      slot:slots (
        escenario:escenarios ( evento_id )
      )
    )
  )
`

async function loadSpeakers(eventoId: string): Promise<LoadResult> {
  if (!isUuid(eventoId)) {
    return {
      speakers: [],
      propiedades: [],
      valoresPorSpeaker: {},
      error: 'El workspace no tiene un id de evento válido (UUID).',
    }
  }

  const [spRes, pv] = await Promise.all([
    supabase
      .from('speakers')
      .select(SPEAKERS_TABLA_SELECT)
      .eq('evento_speakers.evento_id', eventoId)
      .order('nombre'),
    loadPropiedadesYValores(eventoId),
  ])

  if (spRes.error) {
    return {
      speakers: [],
      propiedades: pv.propiedades,
      valoresPorSpeaker: pv.valoresPorSpeaker,
      error: spRes.error.message,
    }
  }

  const speakers: Speaker[] = ((spRes.data ?? []) as SpeakerTablaRow[]).map(
    (r) => {
      const rels = Array.isArray(r.sesion_speakers) ? r.sesion_speakers : []
      let sesionesEnEvento = 0
      for (const rel of rels) {
        const sesion = one(rel.sesion)
        const slot = one(sesion?.slot)
        const escenario = one(slot?.escenario)
        if (escenario?.evento_id === eventoId) sesionesEnEvento += 1
      }
      return mapSpeakerRow(r as unknown as Record<string, unknown>, {
        sesionesEnEvento,
        eventosParticipados: [],
      })
    },
  )

  return {
    speakers,
    propiedades: pv.propiedades,
    valoresPorSpeaker: pv.valoresPorSpeaker,
    error: pv.error,
  }
}

type EventoIdNombreEmbed = { id: string; nombre: string | null }
type EventoSpeakerRel = {
  evento: EventoIdNombreEmbed | EventoIdNombreEmbed[] | null
}
type EscenarioEventoEmbed = {
  evento: { nombre: string | null } | { nombre: string | null }[] | null
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
  evento_speakers?: EventoSpeakerRel[] | null
  sesion_speakers?: SesionSpeakerEventoRel[] | null
}

const SPEAKERS_GLOBAL_SELECT = `
  ${SPEAKER_COLS},
  evento_speakers (
    evento:eventos ( id, nombre )
  ),
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

// Speakers globales + membresía (evento_speakers) + conteo de sesiones.
async function loadSpeakersGlobal(): Promise<LoadResult> {
  const empty = { propiedades: [] as PropiedadCustom[], valoresPorSpeaker: {} }
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKERS_GLOBAL_SELECT)
    .order('nombre')

  if (error) return { speakers: [], ...empty, error: error.message }

  const speakers: Speaker[] = ((data ?? []) as SpeakerGlobalRow[]).map((r) => {
    const memb = Array.isArray(r.evento_speakers) ? r.evento_speakers : []
    const byId = new Map<string, string>()
    for (const rel of memb) {
      const evento = one(rel.evento)
      if (evento?.id) byId.set(evento.id, evento.nombre ?? '')
    }
    // Fallback: eventos solo vía sesión (datos previos al backfill).
    const rels = Array.isArray(r.sesion_speakers) ? r.sesion_speakers : []
    for (const rel of rels) {
      const sesion = one(rel.sesion)
      const slot = one(sesion?.slot)
      const escenario = one(slot?.escenario)
      const evento = one(escenario?.evento)
      const nombre = evento?.nombre
      if (nombre && ![...byId.values()].includes(nombre)) {
        byId.set(`nombre:${nombre}`, nombre)
      }
    }
    const eventosAsociados = [...byId.entries()]
      .filter(([id]) => isUuid(id))
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
    const nombres = [
      ...new Set([
        ...eventosAsociados.map((e) => e.nombre),
        ...[...byId.values()].filter(Boolean),
      ]),
    ].sort()

    return mapSpeakerRow(r as unknown as Record<string, unknown>, {
      sesionesEnEvento: rels.length,
      eventosParticipados: nombres,
      eventosAsociados,
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

export async function speakerPorEmail(
  email: string,
): Promise<Speaker | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKER_COLS)
    .ilike('email', normalized)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return mapSpeakerRow(data as unknown as Record<string, unknown>, {
    sesionesEnEvento: 0,
    eventosParticipados: [],
  })
}

/** Asocia un speaker del pool global a un evento. Idempotente. */
export async function asociarSpeakerAEvento(
  eventoId: string,
  speakerId: string,
): Promise<{ created: boolean }> {
  if (!isUuid(eventoId) || !isUuid(speakerId)) {
    throw new Error('eventoId y speakerId deben ser UUID')
  }
  const { data: existing, error: existError } = await supabase
    .from('evento_speakers')
    .select('speaker_id')
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
    .maybeSingle()
  if (existError) throw new Error(existError.message)
  if (existing) return { created: false }

  const { error } = await supabase.from('evento_speakers').insert({
    evento_id: eventoId,
    speaker_id: speakerId,
  })
  if (error) throw new Error(error.message)
  return { created: true }
}

export async function desasociarSpeakerDeEvento(
  eventoId: string,
  speakerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('evento_speakers')
    .delete()
    .eq('evento_id', eventoId)
    .eq('speaker_id', speakerId)
  if (error) throw new Error(error.message)
}

/** Búsqueda ligera en el pool global (CRM) por nombre o email. */
export async function buscarSpeakersGlobales(
  query: string,
  limit = 20,
): Promise<Speaker[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // Evita romper el filtro PostgREST si el texto trae comas/comodines.
  const safe = q.replace(/[%_,]/g, ' ').trim()
  if (safe.length < 2) return []
  const pattern = `%${safe}%`
  const { data, error } = await supabase
    .from('speakers')
    .select(SPEAKER_COLS)
    .or(`nombre.ilike."${pattern}",email.ilike."${pattern}"`)
    .order('nombre')
    .limit(limit)

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    mapSpeakerRow(row, {
      sesionesEnEvento: 0,
      eventosParticipados: [],
    }),
  )
}

export async function eliminarSpeaker(id: string): Promise<void> {
  // Limpieza explícita de referencias antes del DELETE, por si alguna FK no
  // tiene ON DELETE CASCADE en la BD real.
  await supabase.from('evento_speakers').delete().eq('speaker_id', id)
  await supabase.from('sesion_speakers').delete().eq('speaker_id', id)
  await supabase.from('valores_propiedades').delete().eq('speaker_id', id)
  const { error } = await supabase.from('speakers').delete().eq('id', id)
  if (error) throw new Error(error.message)
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

export async function actualizarPropiedad(
  id: string,
  patch: { nombre?: string; tipo?: string },
): Promise<void> {
  const { error } = await supabase
    .from('propiedades_custom')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function contarValoresPropiedad(id: string): Promise<number> {
  const { count, error } = await supabase
    .from('valores_propiedades')
    .select('id', { count: 'exact', head: true })
    .eq('propiedad_id', id)
  if (error) throw new Error(error.message)
  return count ?? 0
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
    if (!global && !isUuid(eventoId)) {
      setState({
        ...EMPTY_STATE,
        loading: false,
        error: 'El workspace no tiene un id de evento válido (UUID).',
      })
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
