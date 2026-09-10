import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type OpcionCatalogo = { id: string; nombre: string }

export type EstadoColor = 'gray' | 'yellow' | 'green' | 'red' | 'blue'

export type EstadoSesion = {
  id: string
  nombre: string
  orden: number
  color: EstadoColor
}

export const IDIOMAS_SESION = [
  'Español',
  'Inglés',
  'Portugués',
  'Francés',
  'Alemán',
] as const

export type Sesion = {
  id: string
  titulo: string
  descripcion: string | null
  formato: string | null
  track: string | null
  idioma: string
  capacidadSpeakers: number
  estado: string
  slotId: string
  dia: string // 'YYYY-MM-DD'
  horaInicio: string // 'HH:MM'
  horaFin: string // 'HH:MM'
  escenarioId: string
  escenarioNombre: string
  speakersAsignados: number
}

export type SesionesData = {
  sesiones: Sesion[]
  escenarios: OpcionCatalogo[]
  tracks: OpcionCatalogo[]
  formatos: OpcionCatalogo[]
  estados: EstadoSesion[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export type SesionFormValues = {
  titulo: string
  descripcion: string
  formato: string
  track: string | null // null = "Sin track"
  idioma: string
  escenarioId: string
  dia: string
  horaInicio: string
  horaFin: string
  capacidadSpeakers: number
  estado: string
}

const EMPTY: Omit<SesionesData, 'loading' | 'refetch'> = {
  sesiones: [],
  escenarios: [],
  tracks: [],
  formatos: [],
  estados: [],
  error: null,
}

const COLORES_ESTADO: EstadoColor[] = ['gray', 'yellow', 'green', 'red', 'blue']

function normalizarColorEstado(value: unknown): EstadoColor {
  return COLORES_ESTADO.includes(value as EstadoColor)
    ? (value as EstadoColor)
    : 'gray'
}

function hhmm(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}

function bySlot(a: Sesion, b: Sesion): number {
  const day = a.dia.localeCompare(b.dia)
  if (day !== 0) return day
  return a.horaInicio.localeCompare(b.horaInicio)
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

type EscenarioEmbed = { id: string; nombre: string | null; evento_id: string }
type SlotEmbed = {
  id: string
  dia: string | null
  hora_inicio: string | null
  hora_fin: string | null
  escenario: EscenarioEmbed | EscenarioEmbed[] | null
}
type SesionEmbedRow = {
  id: string
  titulo: string | null
  descripcion: string | null
  formato: string | null
  track: string | null
  idioma: string | null
  capacidad_speakers: number | null
  estado: string | null
  slot: SlotEmbed | SlotEmbed[] | null
  sesion_speakers: { id: string }[] | null
}

const SESIONES_SELECT = `
  id, titulo, descripcion, formato, track, idioma, capacidad_speakers, estado,
  slot:slots!inner (
    id, dia, hora_inicio, hora_fin,
    escenario:escenarios!inner ( id, nombre, evento_id )
  ),
  sesion_speakers ( id )
`

// Una sola query embebida trae sesiones + slot + escenario + conteo de
// speakers; tracks/formatos/escenarios son catálogos pequeños e
// independientes, así que corren en paralelo (no encadenados).
async function loadSesiones(
  eventoId: string,
): Promise<Omit<SesionesData, 'loading' | 'refetch'>> {
  const [escenariosRes, tracksRes, formatosRes, estadosRes, sesionesRes] =
    await Promise.all([
      supabase
        .from('escenarios')
        .select('id, nombre')
        .eq('evento_id', eventoId)
        .order('nombre'),
      supabase
        .from('tracks')
        .select('id, nombre')
        .eq('evento_id', eventoId)
        .order('nombre'),
      supabase
        .from('formatos')
        .select('id, nombre')
        .eq('evento_id', eventoId)
        .order('nombre'),
      supabase
        .from('estados_sesion')
        .select('id, nombre, orden, color')
        .eq('evento_id', eventoId)
        .order('orden'),
      supabase
        .from('sesiones')
        .select(SESIONES_SELECT)
        .eq('slot.escenario.evento_id', eventoId),
    ])

  const escenarios = (escenariosRes.data ?? []) as OpcionCatalogo[]
  const tracks = (tracksRes.data ?? []) as OpcionCatalogo[]
  const formatos = (formatosRes.data ?? []) as OpcionCatalogo[]
  const estados: EstadoSesion[] = (estadosRes.data ?? []).map((row) => ({
    id: row.id as string,
    nombre: (row.nombre as string | null) ?? '',
    orden: (row.orden as number | null) ?? 0,
    color: normalizarColorEstado(row.color),
  }))
  const error =
    sesionesRes.error?.message ??
    escenariosRes.error?.message ??
    tracksRes.error?.message ??
    formatosRes.error?.message ??
    estadosRes.error?.message ??
    null

  if (sesionesRes.error) {
    return { ...EMPTY, escenarios, tracks, formatos, estados, error }
  }

  const sesiones: Sesion[] = ((sesionesRes.data ?? []) as SesionEmbedRow[])
    .map((row) => {
      const slot = one(row.slot)
      const escenario = one(slot?.escenario)
      return {
        id: row.id,
        titulo: row.titulo ?? '',
        descripcion: row.descripcion ?? null,
        formato: row.formato ?? null,
        track: row.track ?? null,
        idioma: row.idioma ?? 'Español',
        capacidadSpeakers: row.capacidad_speakers ?? 1,
        estado: row.estado ?? 'BORRADOR',
        slotId: slot?.id ?? '',
        dia: slot?.dia ?? '',
        horaInicio: hhmm(slot?.hora_inicio),
        horaFin: hhmm(slot?.hora_fin),
        escenarioId: escenario?.id ?? '',
        escenarioNombre: escenario?.nombre ?? '',
        speakersAsignados: Array.isArray(row.sesion_speakers)
          ? row.sesion_speakers.length
          : 0,
      }
    })
    .sort(bySlot)

  return { sesiones, escenarios, tracks, formatos, estados, error }
}

async function findOrCreateSlot(
  escenarioId: string,
  dia: string,
  horaInicio: string,
  horaFin: string,
): Promise<{ id: string } | { error: string }> {
  const existing = await supabase
    .from('slots')
    .select('id')
    .eq('escenario_id', escenarioId)
    .eq('dia', dia)
    .eq('hora_inicio', horaInicio)
    .maybeSingle()

  if (existing.error) return { error: existing.error.message }
  if (existing.data) return { id: existing.data.id as string }

  const created = await supabase
    .from('slots')
    .insert({
      escenario_id: escenarioId,
      dia,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
    })
    .select('id')
    .single()

  if (created.error) return { error: created.error.message }
  return { id: created.data.id as string }
}

export async function crearSesion(
  values: SesionFormValues,
): Promise<{ error: string | null }> {
  const slot = await findOrCreateSlot(
    values.escenarioId,
    values.dia,
    values.horaInicio,
    values.horaFin,
  )
  if ('error' in slot) return { error: slot.error }

  const res = await supabase.from('sesiones').insert({
    slot_id: slot.id,
    titulo: values.titulo,
    descripcion: values.descripcion.trim() || null,
    formato: values.formato || null,
    track: values.track,
    idioma: values.idioma,
    capacidad_speakers: values.capacidadSpeakers,
    estado: values.estado,
  })

  return { error: res.error?.message ?? null }
}

export async function actualizarSesion(
  sesionId: string,
  slotId: string,
  values: SesionFormValues,
): Promise<{ error: string | null }> {
  const [sesionRes, slotRes] = await Promise.all([
    supabase
      .from('sesiones')
      .update({
        titulo: values.titulo,
        descripcion: values.descripcion.trim() || null,
        formato: values.formato || null,
        track: values.track,
        idioma: values.idioma,
        capacidad_speakers: values.capacidadSpeakers,
        estado: values.estado,
      })
      .eq('id', sesionId),
    supabase
      .from('slots')
      .update({
        escenario_id: values.escenarioId,
        dia: values.dia,
        hora_inicio: values.horaInicio,
        hora_fin: values.horaFin,
      })
      .eq('id', slotId),
  ])

  return { error: sesionRes.error?.message ?? slotRes.error?.message ?? null }
}

export async function eliminarSesion(
  sesionId: string,
): Promise<{ error: string | null }> {
  const res = await supabase.from('sesiones').delete().eq('id', sesionId)
  return { error: res.error?.message ?? null }
}

export async function actualizarEstadoSesion(
  sesionId: string,
  estado: string,
): Promise<{ error: string | null }> {
  const res = await supabase
    .from('sesiones')
    .update({ estado })
    .eq('id', sesionId)
  return { error: res.error?.message ?? null }
}

// Updates puntuales para edición inline en la tabla (título/track/capacidad/
// estado en sesiones, día/hora en el slot). El SesionFormDialog sigue siendo
// el camino completo.
export async function actualizarCampoSesion(
  sesionId: string,
  patch: {
    titulo?: string
    track?: string | null
    idioma?: string
    capacidad_speakers?: number
    estado?: string
  },
): Promise<{ error: string | null }> {
  const res = await supabase.from('sesiones').update(patch).eq('id', sesionId)
  return { error: res.error?.message ?? null }
}

export async function actualizarCampoSlot(
  slotId: string,
  patch: { dia?: string; hora_inicio?: string },
): Promise<{ error: string | null }> {
  const res = await supabase.from('slots').update(patch).eq('id', slotId)
  return { error: res.error?.message ?? null }
}

// Edición inline de escenario: ¿el slot destino (escenario+día+hora) ya lo
// ocupa OTRA sesión? (un slot admite una sola sesión).
export async function slotOcupadoPorOtraSesion(
  escenarioId: string,
  dia: string,
  horaInicio: string,
  sesionIdActual: string,
): Promise<{ ocupado: boolean; error: string | null }> {
  const slotRes = await supabase
    .from('slots')
    .select('id')
    .eq('escenario_id', escenarioId)
    .eq('dia', dia)
    .eq('hora_inicio', horaInicio)
    .maybeSingle()
  if (slotRes.error) return { ocupado: false, error: slotRes.error.message }
  if (!slotRes.data) return { ocupado: false, error: null }

  const sesRes = await supabase
    .from('sesiones')
    .select('id')
    .eq('slot_id', slotRes.data.id as string)
    .neq('id', sesionIdActual)
    .limit(1)
  if (sesRes.error) return { ocupado: false, error: sesRes.error.message }
  return { ocupado: (sesRes.data ?? []).length > 0, error: null }
}

// Reasigna la sesión a un slot del nuevo escenario (mismo día/hora),
// creándolo si no existe. Reutiliza findOrCreateSlot.
export async function reasignarEscenarioSesion(
  sesionId: string,
  escenarioId: string,
  dia: string,
  horaInicio: string,
  horaFin: string,
): Promise<{ error: string | null }> {
  const slot = await findOrCreateSlot(escenarioId, dia, horaInicio, horaFin)
  if ('error' in slot) return { error: slot.error }
  const res = await supabase
    .from('sesiones')
    .update({ slot_id: slot.id })
    .eq('id', sesionId)
  return { error: res.error?.message ?? null }
}

export type SpeakerLite = {
  id: string
  nombre: string
  cargo: string | null
  empresa: string | null
  fotoUrl: string | null
}

export type SesionSpeaker = SpeakerLite & {
  sesionSpeakerId: string
  rol: string
}

export const ROLES_SPEAKER = [
  'moderador',
  'panelista',
  'host',
  'keynote',
] as const

type SpeakerRow = {
  id: string
  nombre: string | null
  cargo: string | null
  empresa: string | null
  foto_url: string | null
}

function toSpeakerLite(row: SpeakerRow): SpeakerLite {
  return {
    id: row.id,
    nombre: row.nombre ?? '',
    cargo: row.cargo ?? null,
    empresa: row.empresa ?? null,
    fotoUrl: row.foto_url ?? null,
  }
}

export async function speakersDeSesion(
  sesionId: string,
): Promise<{ data: SesionSpeaker[]; error: string | null }> {
  const res = await supabase
    .from('sesion_speakers')
    .select('id, rol, speaker:speakers(id, nombre, cargo, empresa, foto_url)')
    .eq('sesion_id', sesionId)
    .order('created_at')

  if (res.error) return { data: [], error: res.error.message }

  const data: SesionSpeaker[] = (res.data ?? [])
    .map((row) => {
      const rel = (row as { speaker: unknown }).speaker
      const speaker = (Array.isArray(rel) ? rel[0] : rel) as SpeakerRow | null
      if (!speaker) return null
      return {
        ...toSpeakerLite(speaker),
        sesionSpeakerId: row.id as string,
        rol: (row.rol as string | null) ?? 'panelista',
      }
    })
    .filter((row): row is SesionSpeaker => row !== null)

  return { data, error: null }
}

export async function buscarSpeakers(
  termino: string,
  limit = 8,
): Promise<{ data: SpeakerLite[]; error: string | null }> {
  const term = termino.trim()

  let query = supabase
    .from('speakers')
    .select('id, nombre, cargo, empresa, foto_url')
    .order('nombre')
    .limit(limit)

  if (term.length > 0) {
    const pattern = `%${term}%`
    query = query.or(
      `nombre.ilike.${pattern},empresa.ilike.${pattern},cargo.ilike.${pattern}`,
    )
  }

  const res = await query
  if (res.error) return { data: [], error: res.error.message }
  return {
    data: (res.data ?? []).map((row) => toSpeakerLite(row as SpeakerRow)),
    error: null,
  }
}

export async function asignarSpeaker(
  sesionId: string,
  speakerId: string,
  rol = 'panelista',
): Promise<{ error: string | null }> {
  const res = await supabase
    .from('sesion_speakers')
    .insert({ sesion_id: sesionId, speaker_id: speakerId, rol })
  return { error: res.error?.message ?? null }
}

export async function cambiarRolSpeaker(
  sesionSpeakerId: string,
  rol: string,
): Promise<{ error: string | null }> {
  const res = await supabase
    .from('sesion_speakers')
    .update({ rol })
    .eq('id', sesionSpeakerId)
  return { error: res.error?.message ?? null }
}

export async function desasignarSpeaker(
  sesionSpeakerId: string,
): Promise<{ error: string | null }> {
  const res = await supabase
    .from('sesion_speakers')
    .delete()
    .eq('id', sesionSpeakerId)
  return { error: res.error?.message ?? null }
}

function shiftTime(value: string | null, minutos: number): string {
  const [h = '0', m = '0', s = '0'] = (value ?? '00:00:00').split(':')
  const total = Number(h) * 60 + Number(m) + minutos
  const wrapped = ((total % 1440) + 1440) % 1440
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const mm = String(wrapped % 60).padStart(2, '0')
  const ss = String(Number(s)).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export async function desplazarAgenda(
  eventoId: string,
  minutos: number,
): Promise<{ error: string | null }> {
  const escenariosRes = await supabase
    .from('escenarios')
    .select('id')
    .eq('evento_id', eventoId)

  if (escenariosRes.error) return { error: escenariosRes.error.message }
  const escenarioIds = (escenariosRes.data ?? []).map((row) => row.id as string)
  if (escenarioIds.length === 0) return { error: null }

  const slotsRes = await supabase
    .from('slots')
    .select('id, hora_inicio, hora_fin')
    .in('escenario_id', escenarioIds)

  if (slotsRes.error) return { error: slotsRes.error.message }

  const updates = (slotsRes.data ?? []).map((slot) =>
    supabase
      .from('slots')
      .update({
        hora_inicio: shiftTime(slot.hora_inicio as string | null, minutos),
        hora_fin: shiftTime(slot.hora_fin as string | null, minutos),
      })
      .eq('id', slot.id as string),
  )

  const results = await Promise.all(updates)
  const failed = results.find((res) => res.error)
  return { error: failed?.error?.message ?? null }
}

export function useSesionesData(
  eventoId: string | null | undefined,
): SesionesData {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<Omit<SesionesData, 'refetch'>>({
    ...EMPTY,
    loading: Boolean(eventoId),
  })

  const refetch = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    if (!eventoId) {
      setState({ ...EMPTY, loading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    loadSesiones(eventoId).then((next) => {
      if (!cancelled) setState({ ...next, loading: false })
    })

    return () => {
      cancelled = true
    }
  }, [eventoId, tick])

  return { ...state, refetch }
}
