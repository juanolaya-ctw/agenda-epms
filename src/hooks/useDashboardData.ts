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

type SesionRow = {
  id: string
  titulo: string | null
  capacidad_speakers: number | null
  slot_id: string | null
  estado: string | null
}

// Una sola lectura de `sesiones`; total, sesionIds y sesionesConCupo se
// derivan de este mismo resultado en memoria (antes eran 3 queries).
async function fetchSesiones(slotIds: string[]) {
  if (slotIds.length === 0) {
    return { rows: [] as SesionRow[], error: null as string | null }
  }
  const { data, error } = await supabase
    .from('sesiones')
    .select('id, titulo, capacidad_speakers, slot_id, estado')
    .in('slot_id', slotIds)
  return { rows: (data ?? []) as SesionRow[], error: queryErrorMessage(error) }
}

// Nombres de estados marcados `cuenta_para_cupos = true` en el catálogo del
// evento. Reemplaza el literal 'CANCELADA' hardcodeado. Set vacío = el evento
// no tiene catálogo → no se filtra por estado (se cuentan todas).
async function fetchEstadosQueCuentan(eventoId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('estados_sesion')
    .select('nombre')
    .eq('evento_id', eventoId)
    .eq('cuenta_para_cupos', true)
  return new Set((data ?? []).map((r) => r.nombre as string))
}

async function fetchAsignadosBySesion(sesionIds: string[]) {
  if (sesionIds.length === 0) {
    return { map: new Map<string, number>(), error: null as string | null }
  }
  const { data, error } = await supabase
    .from('sesion_speakers')
    .select('id, sesion_id')
    .in('sesion_id', sesionIds)

  const map = (data ?? []).reduce((acc, row) => {
    const sid = row.sesion_id as string
    acc.set(sid, (acc.get(sid) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  return { map, error: queryErrorMessage(error) }
}

function construirSesionesAbiertas(
  rows: SesionRow[],
  asignadosBySesion: Map<string, number>,
  slotsById: Map<
    string,
    { dia: string; hora_inicio: string; escenario_id: string }
  >,
  escenarioNombre: Map<string, string>,
  estadosQueCuentan: Set<string>,
): SesionConCupo[] {
  const filtrarPorEstado = estadosQueCuentan.size > 0
  return rows
    .filter(
      (row) =>
        !filtrarPorEstado || estadosQueCuentan.has((row.estado ?? '').trim()),
    )
    .map((row) => {
      const slot = slotsById.get(row.slot_id ?? '')
      return {
        id: row.id,
        titulo: row.titulo ?? '',
        capacidadSpeakers: row.capacidad_speakers ?? 1,
        speakersAsignados: asignadosBySesion.get(row.id) ?? 0,
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
  // El catálogo de estados solo depende de eventoId → en paralelo con el grafo.
  const [graph, estadosQueCuentan] = await Promise.all([
    loadEventGraph(eventoId),
    fetchEstadosQueCuentan(eventoId),
  ])
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

  const sesionesRes = await fetchSesiones(graph.slotIds)
  if (sesionesRes.error) {
    return {
      ...EMPTY,
      error: sesionesRes.error,
      kpiErrors: {
        totalSesiones: sesionesRes.error,
        sesionesConCupo: sesionesRes.error,
        requestsPendientes: sesionesRes.error,
        requestsEnRevision: sesionesRes.error,
      },
    }
  }

  const sesiones = sesionesRes.rows
  const sesionIds = sesiones.map((row) => row.id)

  const [asignados, pendientes, revision] = await Promise.all([
    fetchAsignadosBySesion(sesionIds),
    countRequests(sesionIds, 'PENDIENTE'),
    countRequests(sesionIds, 'EN_REVISION'),
  ])

  const sesionesAbiertas = construirSesionesAbiertas(
    sesiones,
    asignados.map,
    graph.slotsById,
    graph.escenarioNombre,
    estadosQueCuentan,
  )

  const kpiErrors: DashboardData['kpiErrors'] = {}
  if (asignados.error) kpiErrors.sesionesConCupo = asignados.error
  if (pendientes.error) kpiErrors.requestsPendientes = pendientes.error
  if (revision.error) kpiErrors.requestsEnRevision = revision.error

  const firstError =
    asignados.error ?? pendientes.error ?? revision.error ?? null

  return {
    totalSesiones: sesiones.length,
    sesionesConCupo: sesionesAbiertas.length,
    requestsPendientes: pendientes.value,
    requestsEnRevision: revision.value,
    error: firstError,
    kpiErrors,
    sesionesAbiertas,
  }
}

// Conteo aislado para el badge de la pestaña Requests en WorkspaceLayout.
// Una sola query filtrada en el servidor (join embebido, usa idx_requests_sesion)
// en vez de cargar todo el agregado del dashboard.
export function useRequestsPendientesCount(
  eventoId: string | null | undefined,
): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!eventoId) {
      setCount(0)
      return
    }

    let cancelled = false
    supabase
      .from('requests')
      .select(
        'id, sesion:sesiones!inner(slot:slots!inner(escenario:escenarios!inner(evento_id)))',
        { count: 'exact', head: true },
      )
      .eq('estado', 'PENDIENTE')
      .eq('sesion.slot.escenario.evento_id', eventoId)
      .then(({ count: value }) => {
        if (!cancelled) setCount(value ?? 0)
      })

    return () => {
      cancelled = true
    }
  }, [eventoId])

  return count
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
