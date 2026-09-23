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

export type SesionesPorEscenario = {
  escenario: string
  total: number
}

export type DashboardKpiKey =
  | 'totalSesiones'
  | 'sesionesConCupo'
  | 'requestsPendientes'
  | 'requestsEnRevision'
  | 'speakersTotales'
  | 'sinSesionAsignada'
  | 'toolkitEnviado'
  | 'publicaronFase1'

export type DashboardData = {
  totalSesiones: number
  sesionesConCupo: number
  requestsPendientes: number
  requestsEnRevision: number
  speakersTotales: number
  sinSesionAsignada: number
  toolkitEnviado: number
  publicaronFase1: number
  loading: boolean
  error: string | null
  kpiErrors: Partial<Record<DashboardKpiKey, string>>
  sesionesAbiertas: SesionConCupo[]
  sesionesPorEscenario: SesionesPorEscenario[]
  sesionesPorEscenarioError: string | null
}

const PROP_TOOLKIT_FASE1 = 'Envio toolkit Soy Speaker'
const PROP_PUBLICARON_F1 = 'Speakers que publicaron F1'

const EMPTY: Omit<DashboardData, 'loading'> = {
  totalSesiones: 0,
  sesionesConCupo: 0,
  requestsPendientes: 0,
  requestsEnRevision: 0,
  speakersTotales: 0,
  sinSesionAsignada: 0,
  toolkitEnviado: 0,
  publicaronFase1: 0,
  error: null,
  kpiErrors: {},
  sesionesAbiertas: [],
  sesionesPorEscenario: [],
  sesionesPorEscenarioError: null,
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

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function esValorTrue(valor: unknown): boolean {
  return valor === true || valor === 'true'
}

async function countSpeakersGlobales() {
  const { count, error } = await supabase
    .from('speakers')
    .select('id', { count: 'exact', head: true })
  return { value: count ?? 0, error: queryErrorMessage(error) }
}

async function countSpeakersAsignados(eventoId: string) {
  const { data, error } = await supabase
    .from('sesion_speakers')
    .select(
      'speaker_id, sesion:sesiones!inner(slot:slots!inner(escenario:escenarios!inner(evento_id)))',
    )
    .eq('sesion.slot.escenario.evento_id', eventoId)
    .limit(10000)

  if (error) return { value: 0, error: queryErrorMessage(error) }

  const ids = new Set<string>()
  for (const row of data ?? []) {
    const speakerId = row.speaker_id as string | null
    if (speakerId) ids.add(speakerId)
  }
  return { value: ids.size, error: null as string | null }
}

type CheckboxCounts = {
  toolkit: { value: number; error: string | null }
  publicaron: { value: number; error: string | null }
}

async function countCheckboxPorNombre(eventoId: string): Promise<CheckboxCounts> {
  const { data: props, error: propsError } = await supabase
    .from('propiedades_custom')
    .select('id, nombre')
    .eq('evento_id', eventoId)
    .eq('entidad', 'speaker')
    .in('nombre', [PROP_TOOLKIT_FASE1, PROP_PUBLICARON_F1])

  if (propsError) {
    const msg = queryErrorMessage(propsError)
    return {
      toolkit: { value: 0, error: msg },
      publicaron: { value: 0, error: msg },
    }
  }

  const byNombre = new Map(
    (props ?? []).map((row) => [row.nombre as string, row.id as string]),
  )
  const toolkitId = byNombre.get(PROP_TOOLKIT_FASE1)
  const publicaronId = byNombre.get(PROP_PUBLICARON_F1)
  const propiedadIds = [toolkitId, publicaronId].filter(
    (id): id is string => Boolean(id),
  )

  if (propiedadIds.length === 0) {
    return {
      toolkit: { value: 0, error: null },
      publicaron: { value: 0, error: null },
    }
  }

  const { data: valores, error: valoresError } = await supabase
    .from('valores_propiedades')
    .select('speaker_id, propiedad_id, valor')
    .in('propiedad_id', propiedadIds)
    .limit(10000)

  if (valoresError) {
    const msg = queryErrorMessage(valoresError)
    return {
      toolkit: { value: 0, error: msg },
      publicaron: { value: 0, error: msg },
    }
  }

  const toolkit = new Set<string>()
  const publicaron = new Set<string>()
  for (const row of valores ?? []) {
    const speakerId = row.speaker_id as string | null
    if (!speakerId || !esValorTrue(row.valor)) continue
    if (row.propiedad_id === toolkitId) toolkit.add(speakerId)
    if (row.propiedad_id === publicaronId) publicaron.add(speakerId)
  }

  return {
    toolkit: { value: toolkit.size, error: null },
    publicaron: { value: publicaron.size, error: null },
  }
}

type SlotConSesionesEmbed = { sesiones?: { id: string }[] | { id: string } | null }
type EscenarioConSesionesRow = {
  nombre: string | null
  slots?: SlotConSesionesEmbed[] | SlotConSesionesEmbed | null
}

async function fetchSesionesPorEscenario(eventoId: string) {
  const { data, error } = await supabase
    .from('escenarios')
    .select('nombre, slots!inner(sesiones!inner(id))')
    .eq('evento_id', eventoId)

  if (error) {
    return {
      rows: [] as SesionesPorEscenario[],
      error: queryErrorMessage(error),
    }
  }

  const rows = ((data ?? []) as EscenarioConSesionesRow[])
    .map((escenario) => {
      let total = 0
      for (const slot of asArray(escenario.slots)) {
        total += asArray(slot.sesiones).length
      }
      return { escenario: escenario.nombre ?? '', total }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => {
      const byTotal = b.total - a.total
      if (byTotal !== 0) return byTotal
      return a.escenario.localeCompare(b.escenario, 'es')
    })

  return { rows, error: null as string | null }
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

function contarSesionesPorEscenario(
  rows: SesionRow[],
  slotsById: Map<string, { escenario_id: string; dia: string; hora_inicio: string }>,
  escenarioNombre: Map<string, string>,
): SesionesPorEscenario[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const slot = slotsById.get(row.slot_id ?? '')
    if (!slot) continue
    const nombre = escenarioNombre.get(slot.escenario_id)
    if (!nombre) continue
    counts.set(nombre, (counts.get(nombre) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([escenario, total]) => ({ escenario, total }))
    .sort((a, b) => {
      const byTotal = b.total - a.total
      if (byTotal !== 0) return byTotal
      return a.escenario.localeCompare(b.escenario, 'es')
    })
}

function aplicarConteosIndependientes(
  base: Omit<DashboardData, 'loading'>,
  speakersGlobales: { value: number; error: string | null },
  speakersAsignados: { value: number; error: string | null },
  checkboxCounts: CheckboxCounts,
  escenarios: { rows: SesionesPorEscenario[]; error: string | null },
): Omit<DashboardData, 'loading'> {
  const kpiErrors: DashboardData['kpiErrors'] = { ...base.kpiErrors }

  if (checkboxCounts.toolkit.error) {
    kpiErrors.toolkitEnviado = checkboxCounts.toolkit.error
  }
  if (checkboxCounts.publicaron.error) {
    kpiErrors.publicaronFase1 = checkboxCounts.publicaron.error
  }
  if (speakersGlobales.error) {
    kpiErrors.speakersTotales = speakersGlobales.error
    kpiErrors.sinSesionAsignada = speakersGlobales.error
  }
  if (speakersAsignados.error) {
    kpiErrors.sinSesionAsignada = speakersAsignados.error
  }

  const speakersTotales = speakersGlobales.error ? 0 : speakersGlobales.value
  const sinSesionAsignada =
    speakersAsignados.error || speakersGlobales.error
      ? 0
      : Math.max(0, speakersGlobales.value - speakersAsignados.value)

  const firstError =
    base.error ??
    speakersAsignados.error ??
    speakersGlobales.error ??
    checkboxCounts.toolkit.error ??
    checkboxCounts.publicaron.error ??
    escenarios.error ??
    null

  return {
    ...base,
    speakersTotales,
    sinSesionAsignada,
    toolkitEnviado: checkboxCounts.toolkit.error ? 0 : checkboxCounts.toolkit.value,
    publicaronFase1: checkboxCounts.publicaron.error
      ? 0
      : checkboxCounts.publicaron.value,
    kpiErrors,
    sesionesPorEscenario: escenarios.rows,
    sesionesPorEscenarioError: escenarios.error,
    error: firstError,
  }
}

async function loadDashboard(eventoId: string): Promise<Omit<DashboardData, 'loading'>> {
  // Independientes del grafo de sesiones: conteos de speakers y checkboxes.
  const [
    graph,
    estadosQueCuentan,
    speakersGlobales,
    speakersAsignados,
    checkboxCounts,
    escenarios,
  ] = await Promise.all([
    loadEventGraph(eventoId),
    fetchEstadosQueCuentan(eventoId),
    countSpeakersGlobales(),
    countSpeakersAsignados(eventoId),
    countCheckboxPorNombre(eventoId),
    fetchSesionesPorEscenario(eventoId),
  ])

  if (graph.error) {
    return aplicarConteosIndependientes(
      {
        ...EMPTY,
        error: graph.error,
        kpiErrors: {
          totalSesiones: graph.error,
          sesionesConCupo: graph.error,
          requestsPendientes: graph.error,
          requestsEnRevision: graph.error,
        },
      },
      speakersGlobales,
      speakersAsignados,
      checkboxCounts,
      escenarios,
    )
  }

  const sesionesRes = await fetchSesiones(graph.slotIds)
  if (sesionesRes.error) {
    return aplicarConteosIndependientes(
      {
        ...EMPTY,
        error: sesionesRes.error,
        kpiErrors: {
          totalSesiones: sesionesRes.error,
          sesionesConCupo: sesionesRes.error,
          requestsPendientes: sesionesRes.error,
          requestsEnRevision: sesionesRes.error,
        },
      },
      speakersGlobales,
      speakersAsignados,
      checkboxCounts,
      escenarios,
    )
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

  const escenariosFinal =
    escenarios.error
      ? {
          rows: contarSesionesPorEscenario(
            sesiones,
            graph.slotsById,
            graph.escenarioNombre,
          ),
          error: null as string | null,
        }
      : escenarios

  return aplicarConteosIndependientes(
    {
      totalSesiones: sesiones.length,
      sesionesConCupo: sesionesAbiertas.length,
      requestsPendientes: pendientes.value,
      requestsEnRevision: revision.value,
      speakersTotales: 0,
      sinSesionAsignada: 0,
      toolkitEnviado: 0,
      publicaronFase1: 0,
      error: firstError,
      kpiErrors,
      sesionesAbiertas,
      sesionesPorEscenario: [],
      sesionesPorEscenarioError: null,
    },
    speakersGlobales,
    speakersAsignados,
    checkboxCounts,
    escenariosFinal,
  )
}

// Conteo aislado para el badge de la pestaña Requests en WorkspaceLayout.
// Cuenta PENDIENTE + EN_REVISION (no resueltos). Sin filtro de evento por ahora
// — alineado con la bandeja que lista todos los requests.
const REQUESTS_COUNT_INVALIDATE = 'epms:requests-count-invalidate'

export function invalidateRequestsPendientesCount() {
  window.dispatchEvent(new Event(REQUESTS_COUNT_INVALIDATE))
}

export function useRequestsPendientesCount(
  eventoId: string | null | undefined,
): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // eventoId indica que estamos en vista Agenda de un workspace;
    // el conteo aún no filtra por evento (pocos datos reales).
    if (!eventoId) {
      setCount(0)
      return
    }

    let cancelled = false

    async function load() {
      const { count: value, error } = await supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['PENDIENTE', 'EN_REVISION'])

      if (cancelled) return
      if (error) {
        console.error('[useRequestsPendientesCount]', error.message)
        setCount(0)
        return
      }
      setCount(value ?? 0)
    }

    void load()
    const onInvalidate = () => void load()
    window.addEventListener(REQUESTS_COUNT_INVALIDATE, onInvalidate)

    return () => {
      cancelled = true
      window.removeEventListener(REQUESTS_COUNT_INVALIDATE, onInvalidate)
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
