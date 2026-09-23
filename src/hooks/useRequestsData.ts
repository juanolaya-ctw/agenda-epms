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

export type NuevoRequest = {
  speaker_id?: string | null
  sesion_id?: string | null
  tipo: RequestTipo
  motivo: string
  solicitante_id: string
  solicitante_area: 'Sales' | 'CS'
  estado?: RequestEstado
}

type RequestRow = {
  id: string
  tipo: string
  motivo: string
  estado: string
  respuesta_agenda: string | null
  created_at: string
  speaker_id: string | null
  sesion_id: string | null
  speaker: { id: string; nombre: string } | { id: string; nombre: string }[] | null
  sesion: { id: string; titulo: string } | { id: string; titulo: string }[] | null
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
