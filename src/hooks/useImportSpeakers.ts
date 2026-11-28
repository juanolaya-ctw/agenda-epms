import { supabase } from '@/lib/supabase'
import type {
  FilaRpc,
  MembresiaExistente,
  SpeakerExistente,
} from '@/lib/importSpeakers'

const PAGE = 1000
const CHUNK = 100

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function cargarSpeakersParaMatch(): Promise<SpeakerExistente[]> {
  const out: SpeakerExistente[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('speakers')
      .select('id, nombre, empresa, cargo, email, pais')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as SpeakerExistente[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function cargarMembresiasEvento(
  eventoId: string,
): Promise<MembresiaExistente[]> {
  const out: MembresiaExistente[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('evento_speakers')
      .select(
        'speaker_id, estado, estado_motivo, responsable_texto, proximo_seguimiento_nota, notas_internas, pista_espacio, requiere_viaticos, datos_prospeccion',
      )
      .eq('evento_id', eventoId)
      .order('speaker_id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as MembresiaExistente[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function crearImportLote(args: {
  eventoId: string | null
  archivoNombre: string
  archivoSha256: string
  hoja: string
  mapeo: Record<string, unknown>
}): Promise<string> {
  const { data, error } = await supabase.rpc('crear_import_lote', {
    p_evento_id: args.eventoId,
    p_archivo_nombre: args.archivoNombre,
    p_archivo_sha256: args.archivoSha256,
    p_hoja: args.hoja,
    p_mapeo: args.mapeo,
  })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string' || !data) {
    throw new Error('crear_import_lote no devolvió id')
  }
  return data
}

export type ResultadoFilaRpc = {
  fila_idx: number
  ok: boolean
  error?: string
  accion?: string
  speaker_id?: string
  reasignada_a_existente?: boolean
}

export type ResultadoChunkRpc = {
  resultados: ResultadoFilaRpc[]
  resumen_chunk: Record<string, number>
  resumen_lote: Record<string, number>
}

export async function importarSpeakersLote(args: {
  loteId: string
  eventoId: string | null
  filas: FilaRpc[]
}): Promise<ResultadoChunkRpc> {
  const { data, error } = await supabase.rpc('importar_speakers_lote', {
    p_lote_id: args.loteId,
    p_evento_id: args.eventoId,
    p_filas: args.filas,
  })
  if (error) throw new Error(error.message)
  return data as ResultadoChunkRpc
}

export async function cerrarImportLote(
  loteId: string,
  estado: 'completado' | 'parcial',
): Promise<void> {
  const { error } = await supabase.rpc('cerrar_import_lote', {
    p_lote_id: loteId,
    p_estado: estado,
  })
  if (error) throw new Error(error.message)
}

export type AplicarImportError = Error & {
  loteId?: string
  resultados?: ResultadoFilaRpc[]
  resumen?: Record<string, number>
  parcial?: true
  /** Índice en el array de filas donde falló (chunks previos ya persistidos). */
  offsetDone?: number
}

export async function aplicarImportacion(args: {
  eventoId: string | null
  archivoNombre: string
  archivoSha256: string
  hoja: string
  mapeo: Record<string, unknown>
  filas: FilaRpc[]
  /** Reintentar solo el resto (idempotente: nuevo lote, gestiones ON CONFLICT). */
  startFrom?: number
  onProgress?: (done: number, total: number) => void
}): Promise<{
  loteId: string
  resumen: Record<string, number>
  resultados: ResultadoFilaRpc[]
  parcial: boolean
}> {
  const startFrom = Math.max(0, args.startFrom ?? 0)
  const filas = args.filas.slice(startFrom)
  const loteId = await crearImportLote({
    eventoId: args.eventoId,
    archivoNombre: args.archivoNombre,
    archivoSha256: args.archivoSha256,
    hoja: args.hoja,
    mapeo: args.mapeo,
  })

  const resultados: ResultadoFilaRpc[] = []
  let resumen: Record<string, number> = {}
  const total = args.filas.length

  for (let i = 0; i < filas.length; i += CHUNK) {
    const chunk = filas.slice(i, i + CHUNK)
    try {
      const res = await importarSpeakersLote({
        loteId,
        eventoId: args.eventoId,
        filas: chunk,
      })
      resultados.push(...(res.resultados ?? []))
      resumen = res.resumen_lote ?? resumen
      args.onProgress?.(
        Math.min(startFrom + i + chunk.length, total),
        total,
      )
    } catch (err) {
      await cerrarImportLote(loteId, 'parcial').catch(() => undefined)
      const base = err instanceof Error ? err : new Error(String(err))
      const wrapped: AplicarImportError = Object.assign(base, {
        loteId,
        resultados,
        resumen,
        parcial: true as const,
        offsetDone: startFrom + i,
      })
      throw wrapped
    }
  }

  await cerrarImportLote(loteId, 'completado')
  return { loteId, resumen, resultados, parcial: false }
}

export { CHUNK as IMPORT_CHUNK_SIZE }
