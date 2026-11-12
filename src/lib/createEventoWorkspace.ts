import { supabase } from '@/lib/supabase'
import { COLORES_ESCENARIO_PALETTE } from '@/hooks/useSesionesData'

export type CreateEventoWorkspaceInput = {
  nombre: string
  fechaInicio: string
  fechaFin: string
  coverFile?: File
  escenarios: string[]
  formatos: string[]
  tracks: string[]
  estados: string[]
}

export type CreateEventoWorkspaceResult = {
  id: string
  nombre: string
  fechaInicio: string
  fechaFin: string
  coverUrl?: string
}

/** Nombres exactos que usa el dashboard para KPIs de toolkit/fotos. */
export const DASHBOARD_SPEAKER_CHECKBOX_PROPS = [
  'Envio toolkit Soy Speaker',
  'Speakers que publicaron F1',
  'Envio Fotos',
] as const

function colorPorNombreEstado(nombre: string): string {
  const n = nombre.trim().toUpperCase()
  if (n === 'CONFIRMADA') return 'green'
  if (n === 'CANCELADA') return 'red'
  return 'gray'
}

async function uploadCover(
  eventoId: string,
  file: File,
): Promise<string> {
  const ext =
    file.name.split('.').pop()?.toLowerCase() ||
    file.type.split('/')[1] ||
    'jpg'
  const filename = `covers/evento-${eventoId}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('speaker-fotos')
    .upload(filename, file, {
      contentType: file.type,
      upsert: true,
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage
    .from('speaker-fotos')
    .getPublicUrl(filename)

  return data.publicUrl
}

async function rollbackEvento(eventoId: string): Promise<void> {
  await supabase.from('eventos').delete().eq('id', eventoId)
}

/**
 * Crea un evento real en Supabase y siembra catálogos + props checkbox
 * del dashboard. Si falla a mitad, borra el evento (CASCADE limpia hijos).
 */
export async function createEventoWorkspace(
  input: CreateEventoWorkspaceInput,
): Promise<CreateEventoWorkspaceResult> {
  const nombre = input.nombre.trim()
  if (!nombre) throw new Error('El nombre del evento es obligatorio')
  if (!input.fechaInicio || !input.fechaFin) {
    throw new Error('Las fechas de inicio y fin son obligatorias')
  }

  const { data: evento, error: eventoError } = await supabase
    .from('eventos')
    .insert({
      nombre,
      fecha_inicio: input.fechaInicio,
      fecha_fin: input.fechaFin,
      activo: true,
    })
    .select('id, nombre, fecha_inicio, fecha_fin')
    .single()

  if (eventoError || !evento) {
    throw new Error(eventoError?.message ?? 'No se pudo crear el evento')
  }

  const eventoId = evento.id as string

  try {
    let coverUrl: string | undefined

    if (input.coverFile) {
      coverUrl = await uploadCover(eventoId, input.coverFile)
      const { error: coverError } = await supabase
        .from('eventos')
        .update({ cover_url: coverUrl })
        .eq('id', eventoId)
      if (coverError) throw new Error(coverError.message)
    }

    const escenarios = input.escenarios
      .map((n) => n.trim())
      .filter(Boolean)
    if (escenarios.length > 0) {
      const { error } = await supabase.from('escenarios').insert(
        escenarios.map((nombreEscenario, index) => ({
          evento_id: eventoId,
          nombre: nombreEscenario,
          color:
            COLORES_ESCENARIO_PALETTE[
              index % COLORES_ESCENARIO_PALETTE.length
            ],
        })),
      )
      if (error) throw new Error(error.message)
    }

    const formatos = input.formatos.map((n) => n.trim()).filter(Boolean)
    if (formatos.length > 0) {
      const { error } = await supabase.from('formatos').insert(
        formatos.map((nombreFormato) => ({
          evento_id: eventoId,
          nombre: nombreFormato,
        })),
      )
      if (error) throw new Error(error.message)
    }

    const tracks = input.tracks.map((n) => n.trim()).filter(Boolean)
    if (tracks.length > 0) {
      const { error } = await supabase.from('tracks').insert(
        tracks.map((nombreTrack) => ({
          evento_id: eventoId,
          nombre: nombreTrack,
        })),
      )
      if (error) throw new Error(error.message)
    }

    const estadosRaw = input.estados.map((n) => n.trim()).filter(Boolean)
    const estados =
      estadosRaw.length > 0 ? estadosRaw : ['BORRADOR', 'CONFIRMADA']
    const { error: estadosError } = await supabase
      .from('estados_sesion')
      .insert(
        estados.map((nombreEstado, orden) => ({
          evento_id: eventoId,
          nombre: nombreEstado,
          orden,
          color: colorPorNombreEstado(nombreEstado),
          cuenta_para_cupos: nombreEstado.trim().toUpperCase() !== 'CANCELADA',
        })),
      )
    if (estadosError) throw new Error(estadosError.message)

    const { error: propsError } = await supabase
      .from('propiedades_custom')
      .insert(
        DASHBOARD_SPEAKER_CHECKBOX_PROPS.map((nombreProp, orden) => ({
          evento_id: eventoId,
          entidad: 'speaker',
          nombre: nombreProp,
          tipo: 'checkbox',
          orden,
        })),
      )
    if (propsError) throw new Error(propsError.message)

    const result: CreateEventoWorkspaceResult = {
      id: eventoId,
      nombre: (evento.nombre as string) ?? nombre,
      fechaInicio: (evento.fecha_inicio as string) ?? input.fechaInicio,
      fechaFin: (evento.fecha_fin as string) ?? input.fechaFin,
    }
    if (coverUrl) result.coverUrl = coverUrl
    return result
  } catch (err) {
    await rollbackEvento(eventoId)
    throw err instanceof Error ? err : new Error(String(err))
  }
}
