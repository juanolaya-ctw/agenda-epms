import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type SesionConCupo = {
  id: string
  titulo: string
  capacidadSpeakers: number
  speakersAsignados: number
  dia: string
  horaInicio: string
  escenarioNombre: string
}

export type DashboardKpiKey =
  | 'totalSesiones'
  | 'sesionesConCupo'
  | 'requestsPendientes'
  | 'requestsEnRevision'

export type DashboardData = {
  totalSesiones: number
  sesionesConCupo: number
  requestsPendientes: number
  requestsEnRevision: number
  loading: boolean
  error: string | null
  kpiErrors: Partial<Record<DashboardKpiKey, string>>
  sesionesAbiertas: SesionConCupo[]
}

const EMPTY: Omit<DashboardData, 'loading'> = {
  totalSesiones: 0,
  sesionesConCupo: 0,
  requestsPendientes: 0,
  requestsEnRevision: 0,
  error: null,
  kpiErrors: {},
  sesionesAbiertas: [],
}

function queryErrorMessage(error: { message: string } | null): string | null {
  if (!error?.message) return null
  return error.message
}

async function loadEventGraph(eventoId: string) {
  const escenariosRes = await supabase
    .from('escenarios')
    .select('id, nombre')
    .eq('evento_id', eventoId)

  const escenariosError = queryErrorMessage(escenariosRes.error)
  if (escenariosError) {
    return { error: escenariosError, slotIds: [] as string[], slotsById: new Map<string, { dia: string; hora_inicio: string; escenario_id: string }>(), escenarioNombre: new Map<string, string>() }
  }

  const escenarios = escenariosRes.data ?? []
  const escenarioNombre = new Map(
    escenarios.map((row) => [row.id as string, row.nombre as string]),
  )
  const escenarioIds = escenarios.map((row) => row.id as string)

  if (escenarioIds.length === 0) {
    return {
      error: null as string | null,
      slotIds: [] as string[],
      slotsById: new Map<string, { dia: string; hora_inicio: string; escenario_id: string }>(),
      escenarioNombre,
    }
  }

  const slotsRes = await supabase
    .from('slots')
    .select('id, dia, hora_inicio, escenario_id')
    .in('escenario_id', escenarioIds)

  const slotsError = queryErrorMessage(slotsRes.error)
  if (slotsError) {
    return {
      error: slotsError,
      slotIds: [] as string[],
      slotsById: new Map<string, { dia: string; hora_inicio: string; escenario_id: string }>(),
      escenarioNombre,
    }
  }

  const slots = slotsRes.data ?? []
  const slotsById = new Map(
    slots.map((slot) => [
      slot.id as string,
      {
        dia: slot.dia as string,
        hora_inicio: slot.hora_inicio as string,
        escenario_id: slot.escenario_id as string,
      },
    ]),
  )

  return {
    error: null as string | null,
    slotIds: slots.map((slot) => slot.id as string),
    slotsById,
    escenarioNombre,
  }
}

async function countTotalSesiones(slotIds: string[]) {
  if (slotIds.length === 0) return { value: 0, error: null as string | null }

  const { count, error } = await supabase
    .from('sesiones')
    .select('id', { count: 'exact', head: true })
    .in('slot_id', slotIds)

  return { value: count ?? 0, error: queryErrorMessage(error) }
}

async function fetchSesionesConCupo(
  slotIds: string[],
  slotsById: Map<string, { dia: string; hora_inicio: string; escenario_id: string }>,
  escenarioNombre: Map<string, string>,
) {
  if (slotIds.length === 0) {
    return { value: 0, rows: [] as SesionConCupo[], error: null as string | null }
  }

  const sesionesRes = await supabase
    .from('sesiones')
    .select('id, titulo, capacidad_speakers, slot_id, estado')
    .in('slot_id', slotIds)
    .neq('estado', 'CANCELADA')

  const sesionesError = queryErrorMessage(sesionesRes.error)
  if (sesionesError) {
    return { value: 0, rows: [] as SesionConCupo[], error: sesionesError }
  }

  const sesiones = sesionesRes.data ?? []
  const sesionIds = sesiones.map((row) => row.id as string)

  let assignedBySesion = new Map<string, number>()
  if (sesionIds.length > 0) {
    const speakersRes = await supabase
      .from('sesion_speakers')
      .select('id, sesion_id')
      .in('sesion_id', sesionIds)

    const speakersError = queryErrorMessage(speakersRes.error)
    if (speakersError) {
      return { value: 0, rows: [] as SesionConCupo[], error: speakersError }
    }

    assignedBySesion = (speakersRes.data ?? []).reduce((map, row) => {
      const sesionId = row.sesion_id as string
      map.set(sesionId, (map.get(sesionId) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  }

  const rows = sesiones
    .map((row) => {
      const slot = slotsById.get(row.slot_id as string)
      const capacidad = (row.capacidad_speakers as number | null) ?? 1
      const asignados = assignedBySesion.get(row.id as string) ?? 0
      return {
        id: row.id as string,
        titulo: row.titulo as string,
        capacidadSpeakers: capacidad,
        speakersAsignados: asignados,
        dia: slot?.dia ?? '',
        horaInicio: slot?.hora_inicio ?? '',
        escenarioNombre: slot
          ? (escenarioNombre.get(slot.escenario_id) ?? '')
          : '',
      }
    })
    .filter((row) => row.capacidadSpeakers - row.speakersAsignados > 0)
    .sort((a, b) => {
      const day = a.dia.localeCompare(b.dia)
      if (day !== 0) return day
      return a.horaInicio.localeCompare(b.horaInicio)
    })

  return { value: rows.length, rows, error: null as string | null }
}

async function countRequests(sesionIds: string[], estado: 'PENDIENTE' | 'EN_REVISION') {
  if (sesionIds.length === 0) return { value: 0, error: null as string | null }

  const { count, error } = await supabase
    .from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado)
    .in('sesion_id', sesionIds)

  return { value: count ?? 0, error: queryErrorMessage(error) }
}

async function loadDashboard(eventoId: string): Promise<Omit<DashboardData, 'loading'>> {
  const graph = await loadEventGraph(eventoId)
  if (graph.error) {
    return {
      ...EMPTY,
      error: graph.error,
      kpiErrors: {
        totalSesiones: graph.error,
        sesionesConCupo: graph.error,
        requestsPendientes: graph.error,
        requestsEnRevision: graph.error,
      },
    }
  }

  const sesionesRes =
    graph.slotIds.length === 0
      ? { data: [] as { id: string }[], error: null }
      : await supabase.from('sesiones').select('id').in('slot_id', graph.slotIds)

  const sesionesError = queryErrorMessage(sesionesRes.error)
  const sesionIds = (sesionesRes.data ?? []).map((row) => row.id as string)

  const [total, cupo, pendientes, revision] = await Promise.all([
    sesionesError
      ? Promise.resolve({ value: 0, error: sesionesError })
      : countTotalSesiones(graph.slotIds),
    sesionesError
      ? Promise.resolve({
          value: 0,
          rows: [] as SesionConCupo[],
          error: sesionesError,
        })
      : fetchSesionesConCupo(graph.slotIds, graph.slotsById, graph.escenarioNombre),
    sesionesError
      ? Promise.resolve({ value: 0, error: sesionesError })
      : countRequests(sesionIds, 'PENDIENTE'),
    sesionesError
      ? Promise.resolve({ value: 0, error: sesionesError })
      : countRequests(sesionIds, 'EN_REVISION'),
  ])

  const kpiErrors: DashboardData['kpiErrors'] = {}
  if (total.error) kpiErrors.totalSesiones = total.error
  if (cupo.error) kpiErrors.sesionesConCupo = cupo.error
  if (pendientes.error) kpiErrors.requestsPendientes = pendientes.error
  if (revision.error) kpiErrors.requestsEnRevision = revision.error

  const firstError =
    total.error ?? cupo.error ?? pendientes.error ?? revision.error ?? null

  return {
    totalSesiones: total.value,
    sesionesConCupo: cupo.value,
    requestsPendientes: pendientes.value,
    requestsEnRevision: revision.value,
    error: firstError,
    kpiErrors,
    sesionesAbiertas: cupo.rows,
  }
}

export function useDashboardData(eventoId: string | null | undefined): DashboardData {
  const [state, setState] = useState<DashboardData>({
    ...EMPTY,
    loading: Boolean(eventoId),
  })

  useEffect(() => {
    if (!eventoId) {
      setState({ ...EMPTY, loading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null, kpiErrors: {} }))

    loadDashboard(eventoId).then((next) => {
      if (!cancelled) setState({ ...next, loading: false })
    })

    return () => {
      cancelled = true
    }
  }, [eventoId])

  return state
}
