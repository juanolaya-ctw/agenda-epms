// Contrato local de ingreso de una quote (voluntaria por WhatsApp -> Instinct -> fila). Solo valida y arma la fila; no escribe en ningun lado.
// "Recibido" no es "persistido" ni "aprobado": la fila nace en estado pendiente y la aprobacion sigue siendo humana, atada al hash.
import type { FilaDB } from './backend'
export interface IngresoQuote {
  speaker_id: string; sesion_id: string
  original: string // texto tal como llego, no se edita
  propuesta: string // edicion propuesta (quote_propuesta)
  origen: { autor: string; canal: string; recibido_en: string; mensaje_id: string } // referencia recuperable
}
// La agenda de entrada debe ser la del endpoint publico en vivo (api/agenda): la regla del usuario es la primera charla del Escenario principal; el endpoint solo expone CONFIRMADA (ESTADO_PUBLICO), asi que 'publica' = presente en esa respuesta.
export interface AgendaSesion { id: string; titulo: string; escenario: string; inicio: string; estado: string; publica?: boolean; speakers: { id: string; nombre: string; cargo: string }[] }
export type ResIngreso = { ok: true; fila: FilaDB } | { ok: false; errores: string[] }
export function validarIngreso(ing: IngresoQuote, agenda: AgendaSesion[], existentes: { speaker_id: string }[]): ResIngreso {
  const e: string[] = []
  const s = agenda.find((x) => x.id === ing.sesion_id)
  const sp = s?.speakers.find((x) => x.id === ing.speaker_id)
  if (!s) e.push('la sesion no existe en la agenda')
  else {
    if (s.escenario !== 'Escenario principal') e.push('solo Escenario principal lleva quote')
    if (s.publica === false || (s.publica === undefined && s.estado !== 'CONFIRMADA')) e.push('la sesion no esta en la agenda publica')
    if (!sp) e.push('el speaker no esta en esa sesion')
    else {
      const primera = agenda.filter((x) => x.escenario === 'Escenario principal' && (x.publica ?? x.estado === 'CONFIRMADA') && x.speakers.some((y) => y.id === ing.speaker_id)).sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
      if (primera && primera.id !== s.id) e.push(`no es su primera charla en principal (es "${primera.titulo}")`)
    }
  }
  if (!ing.original.trim()) e.push('falta el original')
  if (!ing.propuesta.trim()) e.push('falta la propuesta')
  const o = ing.origen
  if (!o || !o.autor || !o.canal || !o.recibido_en || !o.mensaje_id) e.push('origen incompleto (autor, canal, fecha, mensaje)')
  if (existentes.some((x) => x.speaker_id === ing.speaker_id)) e.push('ya existe una quote de este speaker: va como nueva version con revision, no se sobrescribe')
  if (e.length || !s || !sp) return { ok: false, errores: e }
  return { ok: true, fila: { id: 'q-' + ing.speaker_id.slice(0, 8), speaker: sp.nombre, cargo: sp.cargo, charla: s.titulo, quote: ing.propuesta.trim(), estado: 'pendiente', foto: '', face: null, enc: { zoom: 1, px: 0, py: 0 }, candidato_hash: null, candidato_path: null, publicada: false, ingreso: { speaker_id: ing.speaker_id, sesion_id: ing.sesion_id, original: ing.original, origen: o } } }
}
