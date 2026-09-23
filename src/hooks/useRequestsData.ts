import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type RequestTipo = 'propuesta_speaker' | 'conflicto' | 'ajuste'

export type RequestEstado =
  | 'PENDIENTE'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'

export type SolicitudRequest = {
  id: string
  tipo: RequestTipo
  motivo: string
  estado: RequestEstado
  respuesta_agenda: string | null
  created_at: string
  speaker_id: string | null
  sesion_id: string | null
  speakerNombre: string | null
  sesionTitulo: string | null
}

/** Request en la bandeja de Agenda (joins más ricos). */
export type AgendaRequest = {
  id: string
  tipo: RequestTipo
  motivo: string
  estado: RequestEstado
  respuesta_agenda: string | null
  created_at: string
  solicitante_area: 'Sales' | 'CS'
  speaker_id: string | null
  sesion_id: string | null
  speakerNombre: string | null
  speakerEmpresa: string | null
  sesionTitulo: string | null
  solicitanteNombre: string | null
}

export type NuevoRequest = {
  speaker_id?: string | null
  sesion_id?: string | null
  tipo: RequestTipo
  motivo: string
  solicitante_id: string
  solicitante_area: 'Sales' | 'CS'
  estado?: RequestEstado
}

type RelSpeaker =
  | { id: string; nombre: string; empresa?: string | null }
  | { id: string; nombre: string; empresa?: string | null }[]
  | null

type RelSesion =
  | { id: string; titulo: string }
  | { id: string; titulo: string }[]
  | null

type RelUsuario =
  | { id: string; nombre: string }
  | { id: string; nombre: string }[]
  | null

type RequestRow = {
  id: string
  tipo: string
  motivo: string
  estado: string
  respuesta_agenda: string | null
  created_at: string
  speaker_id: string | null
  sesion_id: string | null
  speaker: RelSpeaker
  sesion: RelSesion
}

type AgendaRequestRow = RequestRow & {
  solicitante_area: string
  solicitante: RelUsuario
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

function mapRequest(row: RequestRow): SolicitudRequest {
  const speaker = one(row.speaker)
  const sesion = one(row.sesion)
  return {
    id: row.id,
    tipo: row.tipo as RequestTipo,
    motivo: row.motivo,
    estado: row.estado as RequestEstado,
    respuesta_agenda: row.respuesta_agenda,
    created_at: row.created_at,
    speaker_id: row.speaker_id,
    sesion_id: row.sesion_id,
    speakerNombre: speaker?.nombre ?? null,
    sesionTitulo: sesion?.titulo ?? null,
  }
}

function mapAgendaRequest(row: AgendaRequestRow): AgendaRequest {
  const speaker = one(row.speaker)
  const sesion = one(row.sesion)
  const solicitante = one(row.solicitante)
  return {
    id: row.id,
    tipo: row.tipo as RequestTipo,
    motivo: row.motivo,
    estado: row.estado as RequestEstado,
    respuesta_agenda: row.respuesta_agenda,
    created_at: row.created_at,
    solicitante_area: row.solicitante_area as 'Sales' | 'CS',
    speaker_id: row.speaker_id,
    sesion_id: row.sesion_id,
    speakerNombre: speaker?.nombre ?? null,
    speakerEmpresa: speaker?.empresa ?? null,
    sesionTitulo: sesion?.titulo ?? null,
    solicitanteNombre: solicitante?.nombre ?? null,
  }
}

export async function crearRequest(
  datos: NuevoRequest,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('requests').insert({
    speaker_id: datos.speaker_id ?? null,
    sesion_id: datos.sesion_id ?? null,
    tipo: datos.tipo,
    motivo: datos.motivo.trim(),
    solicitante_id: datos.solicitante_id,
    solicitante_area: datos.solicitante_area,
    estado: datos.estado ?? 'PENDIENTE',
  })
  if (error) return { error: error.message }
  return { error: null }
}

export async function decidirRequest(params: {
  id: string
  estado: Extract<RequestEstado, 'APROBADO' | 'RECHAZADO' | 'EN_REVISION'>
  respuesta_agenda: string
  decidido_por: string
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('requests')
    .update({
      estado: params.estado,
      respuesta_agenda: params.respuesta_agenda,
      decidido_por: params.decidido_por,
    })
    .eq('id', params.id)

  if (error) return { error: error.message }
  return { error: null }
}

export function useMisRequests(solicitanteId: string | null | undefined) {
  const [requests, setRequests] = useState<SolicitudRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!solicitanteId) {
      setRequests([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    const { data, error: qError } = await supabase
      .from('requests')
      .select(
        `
        id,
        tipo,
        motivo,
        estado,
        respuesta_agenda,
        created_at,
        speaker_id,
        sesion_id,
        speaker:speakers(id, nombre),
        sesion:sesiones(id, titulo)
      `,
      )
      .eq('solicitante_id', solicitanteId)
      .order('created_at', { ascending: false })

    if (qError) {
      setError(qError.message)
      setRequests([])
      setLoading(false)
      return
    }

    setRequests((data as RequestRow[] | null)?.map(mapRequest) ?? [])
    setLoading(false)
  }, [solicitanteId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { requests, loading, error, refetch }
}

/** Bandeja de Agenda: todos los requests (sin filtro de evento por ahora). */
export function useAgendaRequests() {
  const [requests, setRequests] = useState<AgendaRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qError } = await supabase
      .from('requests')
      .select(
        `
        id,
        tipo,
        motivo,
        estado,
        respuesta_agenda,
        created_at,
        solicitante_area,
        speaker_id,
        sesion_id,
        sesion:sesiones(id, titulo),
        speaker:speakers(id, nombre, empresa),
        solicitante:usuarios!solicitante_id(id, nombre)
      `,
      )
      .order('created_at', { ascending: false })

    if (qError) {
      setError(qError.message)
      setRequests([])
      setLoading(false)
      return
    }

    setRequests((data as AgendaRequestRow[] | null)?.map(mapAgendaRequest) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { requests, loading, error, refetch }
}
