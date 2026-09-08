import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type OpcionCatalogo = { id: string; nombre: string }

export type Sesion = {
  id: string
  titulo: string
  descripcion: string | null
  formato: string | null
  track: string | null
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
  loading: boolean
  error: string | null
  refetch: () => void
}

export type SesionFormValues = {
  titulo: string
  descripcion: string
  formato: string
  track: string | null // null = "Sin track"
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
  error: null,
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

type SlotRow = {
  id: string
  dia: string | null
  hora_inicio: string | null
  hora_fin: string | null
  escenario_id: string
}

async function loadSesiones(
  eventoId: string,
): Promise<Omit<SesionesData, 'loading' | 'refetch'>> {
  const escenariosRes = await supabase
    .from('escenarios')
    .select('id, nombre')
    .eq('evento_id', eventoId)
    .order('nombre')

  if (escenariosRes.error) {
    return { ...EMPTY, error: escenariosRes.error.message }
  }

  const escenarios = (escenariosRes.data ?? []) as OpcionCatalogo[]
  const escenarioIds = escenarios.map((row) => row.id)
  const escenarioNombre = new Map(escenarios.map((row) => [row.id, row.nombre]))

  const [tracksRes, formatosRes] = await Promise.all([
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
  ])

  const catalogError = tracksRes.error?.message ?? formatosRes.error?.message ?? null
  const tracks = (tracksRes.data ?? []) as OpcionCatalogo[]
  const formatos = (formatosRes.data ?? []) as OpcionCatalogo[]

  if (escenarioIds.length === 0) {
    return { ...EMPTY, escenarios, tracks, formatos, error: catalogError }
  }

  const slotsRes = await supabase
    .from('slots')
    .select('id, dia, hora_inicio, hora_fin, escenario_id')
    .in('escenario_id', escenarioIds)

  if (slotsRes.error) {
    return { ...EMPTY, escenarios, tracks, formatos, error: slotsRes.error.message }
  }

  const slotsById = new Map<string, SlotRow>(
    (slotsRes.data ?? []).map((slot) => [slot.id as string, slot as SlotRow]),
  )
  const slotIds = [...slotsById.keys()]

  if (slotIds.length === 0) {
    return { ...EMPTY, escenarios, tracks, formatos, error: catalogError }
  }

  const sesionesRes = await supabase
    .from('sesiones')
    .select(
      'id, titulo, descripcion, formato, track, capacidad_speakers, estado, slot_id, sesion_speakers(count)',
    )
    .in('slot_id', slotIds)

  if (sesionesRes.error) {
    return { ...EMPTY, escenarios, tracks, formatos, error: sesionesRes.error.message }
  }

  const sesiones: Sesion[] = (sesionesRes.data ?? [])
    .map((row) => {
      const slot = slotsById.get(row.slot_id as string)
      const speakersRel = row.sesion_speakers as { count: number }[] | null
      const speakersAsignados = Array.isArray(speakersRel)
        ? Number(speakersRel[0]?.count ?? 0)
        : 0
      const escenarioId = slot?.escenario_id ?? ''
      return {
        id: row.id as string,
        titulo: (row.titulo as string | null) ?? '',
        descripcion: (row.descripcion as string | null) ?? null,
        formato: (row.formato as string | null) ?? null,
        track: (row.track as string | null) ?? null,
        capacidadSpeakers: (row.capacidad_speakers as number | null) ?? 1,
        estado: (row.estado as string | null) ?? 'BORRADOR',
        slotId: row.slot_id as string,
        dia: slot?.dia ?? '',
        horaInicio: hhmm(slot?.hora_inicio),
        horaFin: hhmm(slot?.hora_fin),
        escenarioId,
        escenarioNombre: escenarioNombre.get(escenarioId) ?? '',
        speakersAsignados,
      }
    })
    .sort(bySlot)

  return { sesiones, escenarios, tracks, formatos, error: catalogError }
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
