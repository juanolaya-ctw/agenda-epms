// Cliente REAL del ingreso: llama a epms.tq_ingresar (v9). Sin secretos ni sesion aqui: recibe un cliente ya autenticado (la cuenta Instinct, no aprobadora).
// La base es la autoridad de la regla (Escenario principal, sesion publica, primera charla, idempotencia por mensaje_id); aqui solo se valida lo minimo y se arma la llamada.
import type { IngresoQuote } from './ingreso'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export interface ClienteRpcDatos { rpcDatos(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> }
export type ResIngresoReal = { ok: true; quote_id: string } | { ok: false; paso: 'validacion' | 'rpc'; mensaje: string }
export function argsTqIngresar(ing: IngresoQuote, fotoRef?: string | null, plantilla = 'v1'): Record<string, unknown> {
  return {
    p_speaker: ing.speaker_id, p_sesion: ing.sesion_id, p_original: ing.original, p_propuesta: ing.propuesta,
    p_remitente: ing.origen.autor, p_canal: ing.origen.canal, p_recibido_en: ing.origen.recibido_en, p_mensaje_id: ing.origen.mensaje_id,
    p_foto_ref: fotoRef ?? null, p_plantilla: plantilla,
  }
}
export async function ingresarQuoteReal(c: ClienteRpcDatos, ing: IngresoQuote, fotoRef?: string | null): Promise<ResIngresoReal> {
  const o = ing.origen, falta: string[] = []
  if (!ing.speaker_id || !ing.sesion_id) falta.push('speaker_id/sesion_id')
  else if (!UUID.test(ing.speaker_id) || !UUID.test(ing.sesion_id)) falta.push('speaker_id/sesion_id no son UUID')
  if (!ing.original?.trim()) falta.push('original')
  if (!ing.propuesta?.trim()) falta.push('propuesta')
  if (!o || !o.autor || !o.canal || !o.recibido_en || !o.mensaje_id) falta.push('origen (autor, canal, recibido_en, mensaje_id)')
  else if (Number.isNaN(Date.parse(o.recibido_en))) falta.push('recibido_en no es una fecha')
  if (falta.length) return { ok: false, paso: 'validacion', mensaje: 'falta o es invalido: ' + falta.join(', ') }
  const r = await c.rpcDatos('tq_ingresar', argsTqIngresar(ing, fotoRef))
  if (r.error) return { ok: false, paso: 'rpc', mensaje: r.error }
  if (typeof r.data !== 'string' || !r.data) return { ok: false, paso: 'rpc', mensaje: 'la base no devolvio el id de la quote' }
  return { ok: true, quote_id: r.data }
}
