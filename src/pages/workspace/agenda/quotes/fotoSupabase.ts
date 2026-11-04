// Foto REAL con procedencia (requiere v10): el ejecutor de Instinct sube copias reducidas (JPG, bucket privado toolkit-candidatos, fotos/<speaker>/<sha256>.jpg),
// las registra con su file_id/folder_id de Drive (tq_ofrecer_foto) y elige una (tq_elegir_foto, 'instinct'). Una persona puede cambiarla en la pantalla (tq_elegir_foto, 'persona').
// El original de Drive no se toca. Cambiar la foto invalida candidato y aprobacion (trigger de v8).
import type { FotoDrive, FotoSel } from './fotoDrive'
import type { PrivStorage } from './quotesFlow'
import type { ClienteRpcDatos } from './ingresoRpc'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[0-9a-f]{64}$/
export function fotoRefDe(speakerId: string, sha256: string): string {
  if (!UUID.test(speakerId)) throw new Error('speaker_id invalido')
  if (!SHA.test(sha256)) throw new Error('sha256 invalido')
  return `fotos/${speakerId.toLowerCase()}/${sha256}.jpg`
}
export interface FotoOfrecida { file_id: string; folder_id: string; nombre: string; bytes: Uint8Array; sha256: string; original_sha256: string }
export type ResFotos = { ok: true; refs: string[] } | { ok: false; paso: 'validacion' | 'subida' | 'ofrecer' | 'elegir'; mensaje: string }
const esJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
export async function ofrecerYElegirFotos(priv: PrivStorage, c: ClienteRpcDatos, quoteId: string, speakerId: string, fotos: FotoOfrecida[], elegida: { file_id: string; motivo: string }): Promise<ResFotos> {
  if (!UUID.test(quoteId)) return { ok: false, paso: 'validacion', mensaje: 'quote_id invalido' }
  if (!fotos.length) return { ok: false, paso: 'validacion', mensaje: 'no hay fotos' }
  if (!fotos.some((f) => f.file_id === elegida.file_id)) return { ok: false, paso: 'validacion', mensaje: 'la foto elegida no esta entre las ofrecidas' }
  if (!elegida.motivo.trim()) return { ok: false, paso: 'validacion', mensaje: 'falta el motivo de la eleccion' }
  for (const f of fotos) {
    if (!f.file_id || !f.folder_id || !f.nombre) return { ok: false, paso: 'validacion', mensaje: 'falta la procedencia Drive de una foto' }
    if (!SHA.test(f.original_sha256)) return { ok: false, paso: 'validacion', mensaje: `original_sha256 invalido (${f.nombre})` }
    if (!esJpeg(f.bytes)) return { ok: false, paso: 'validacion', mensaje: `${f.nombre}: no es un JPG` }
  }
  const refs: string[] = []
  for (const f of fotos) {
    const ref = fotoRefDe(speakerId, f.sha256)
    const up = await priv.upload(ref, f.bytes, 'image/jpeg')
    if (up.error && !up.yaExiste) return { ok: false, paso: 'subida', mensaje: `${f.nombre}: ${up.error}` }
    const o = await c.rpcDatos('tq_ofrecer_foto', { p_quote: quoteId, p_file_id: f.file_id, p_folder_id: f.folder_id, p_nombre: f.nombre, p_foto_ref: ref, p_original_sha256: f.original_sha256 })
    if (o.error) return { ok: false, paso: 'ofrecer', mensaje: `${f.nombre}: ${o.error}` }
    refs.push(ref)
  }
  const e = await c.rpcDatos('tq_elegir_foto', { p_quote: quoteId, p_file_id: elegida.file_id, p_elegida_por: 'instinct', p_motivo: elegida.motivo })
  return e.error ? { ok: false, paso: 'elegir', mensaje: e.error } : { ok: true, refs }
}
// Lectura: filas de toolkit_quotes_fotos y la ultima seleccion -> lo que muestra la pantalla.
export interface FotoRow { file_id: string; folder_id: string; nombre: string }
export interface SelRow { file_id: string; elegida_por: string; motivo: string; id: number }
export function mapearFotos(fotos: FotoRow[] | null | undefined, sels: SelRow[] | null | undefined): { fotos: FotoDrive[]; foto_sel?: FotoSel } {
  const lista: FotoDrive[] = (fotos ?? []).map((f) => ({ file_id: f.file_id, folder_id: f.folder_id, nombre: f.nombre, url: '' }))
  const ult = [...(sels ?? [])].sort((a, b) => b.id - a.id)[0]
  const f = ult && lista.find((x) => x.file_id === ult.file_id)
  const foto_sel: FotoSel | undefined = ult && f ? { file_id: f.file_id, folder_id: f.folder_id, nombre: f.nombre, elegida_por: ult.elegida_por === 'instinct' ? 'instinct' : 'persona', motivo: ult.motivo } : undefined
  return { fotos: lista, foto_sel }
}
