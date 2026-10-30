import type { Encuadre } from './quoteLayout'
import type { FotoDrive, FotoSel } from './fotoDrive'
import type { IngresoQuote } from './ingreso'
import type { PrivStorage, PubStorage, QuotesRpc } from './quotesFlow'
export type Estado = 'pendiente' | 'generada' | 'aprobada' | 'necesita_revision' | 'enviada'
export interface FilaDB {
  id: string; speaker: string; cargo: string; charla: string; quote: string; estado: Estado; motivo?: string
  foto: string; face: [number, number, number, number] | null; enc: Encuadre
  candidato_hash: string | null; candidato_path: string | null; publicada: boolean
  delegada_hasta?: string | null
  ingreso?: { speaker_id: string; sesion_id: string; original: string; origen: IngresoQuote['origen'] }
  fotos?: FotoDrive[]; foto_sel?: FotoSel; foto_ref?: string
  /** ultima propuesta recibida (quote_propuesta); si difiere de la quote en uso hay una version nueva sin aplicar */
  propuesta?: string | null
}
export interface QuotesBackend {
  etiqueta: string
  simulado: boolean
  listar(): Promise<FilaDB[]>
  guardarContenido(id: string, c: { quote: string; enc: Encuadre }): Promise<string | null>
  /** aprobador de respaldo (Alexandra); null si no se encuentra */
  respaldo(): Promise<{ id: string; nombre: string } | null>
  /** cambiar la foto elegida entre las de la carpeta de Drive (invalida candidato y aprobacion) */
  elegirFoto?(id: string, fileId: string): Promise<string | null>
  /** solo real: crea/actualiza la quote via tq_ingresar (cuenta Instinct). La base valida la regla de negocio. */
  ingresar?(ing: IngresoQuote, fotoRef?: string | null): Promise<{ ok: true; quote_id: string } | { ok: false; paso: string; mensaje: string }>
  rpc: QuotesRpc
  priv: PrivStorage
  pub: PubStorage
  /** solo simulado: provoca fallo de publicacion en el siguiente intento */
  fallarPublicacion?: { valor: boolean }
}
