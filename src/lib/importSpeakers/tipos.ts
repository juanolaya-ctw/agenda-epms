import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'
import type { GestionTipo } from '@/lib/gestionTipos'

export type CeldaCruda =
  | { kind: 'empty' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'date'; ymd: string }
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }

export type FilaCruda = {
  filaIdx: number
  celdas: CeldaCruda[]
}

export type HojaParseada = {
  nombre: string
  headers: string[]
  filas: FilaCruda[]
}

export type ArchivoParseado = {
  hojas: HojaParseada[]
  hojaActiva: number
}

export type CampoDestino =
  | 'nombre'
  | 'empresa'
  | 'cargo'
  | 'pais'
  | 'email'
  | 'estado'
  | 'pista_espacio'
  | 'responsable_texto'
  | 'requiere_viaticos'
  | 'proximo_seguimiento_nota'
  | 'notas_internas'
  | 'telefono'
  | 'linkedin_url'
  | 'agenda'
  | 'canal_correo'
  | 'canal_correo_fecha'
  | 'canal_linkedin'
  | 'canal_linkedin_fecha'
  | 'canal_referencia'
  | 'canal_referencia_fecha'
  | 'canal_institucion'
  | 'canal_institucion_fecha'
  | 'ignorar'

export type MapeoColumnas = Record<number, CampoDestino>

export type AvisoImport = {
  codigo: string
  mensaje: string
}

export type CanalSnapshot = {
  marcado: boolean
  fecha: string | null
}

export type SnapshotImportExcel = {
  archivo: string
  hoja: string
  fila: number
  importado_at: string
  nombre: string
  empresa: string | null
  cargo: string | null
  pais: string | null
  contacto_raw: string | null
  ubicacion_raw: string | null
  estado_raw: string | null
  agenda: boolean | null
  canales: {
    correo: CanalSnapshot
    linkedin: CanalSnapshot
    referencia: CanalSnapshot
    institucion: CanalSnapshot
  }
  avisos: AvisoImport[]
}

export type GestionPlan = {
  tipo: GestionTipo
  fecha: string
}

export type MatchNivel = 'alta' | 'media' | 'ambigua' | 'ninguna'

export type MatchCandidato = {
  id: string
  nombre: string
  empresa: string | null
  cargo: string | null
  email: string | null
}

export type MatchResultado = {
  nivel: MatchNivel
  motivo: 'email' | 'nombre_empresa' | 'nombre' | 'ninguno' | 'multiple'
  candidatos: MatchCandidato[]
}

export type AccionImport = 'crear' | 'actualizar' | 'omitir' | 'revisar'

export type DiffCampo = {
  campo: string
  hub: string | null
  excel: string | null
  accion: 'rellenar' | 'conservar' | 'sobrescribir' | 'igual'
}

export type FilaNormalizada = {
  filaIdx: number
  nombre: string | null
  nombreNorm: string | null
  empresa: string | null
  empresaNorm: string | null
  cargo: string | null
  pais: string | null
  email: string | null
  emailAprobado: boolean
  telefono: string | null
  linkedinUrl: string | null
  estadoHub: EventoSpeakerEstado
  estadoMotivo: string | null
  estadoRaw: string | null
  requiereViaticos: boolean | null
  pistaEspacio: string | null
  responsableTexto: string | null
  proximoSeguimientoNota: string | null
  notasInternas: string | null
  agenda: boolean | null
  gestiones: GestionPlan[]
  canales: SnapshotImportExcel['canales']
  avisos: AvisoImport[]
  error: string | null
}

export type FilaPlan = {
  fila: FilaNormalizada
  match: MatchResultado
  accion: AccionImport
  speakerId: string | null
  sobrescribirEstado: boolean
  diffs: DiffCampo[]
  gestionesACrear: GestionPlan[]
  sinCambios: boolean
  homonimoEnArchivo: boolean
}

export type ResumenPlan = {
  crear: number
  actualizar: number
  omitir: number
  revisar: number
  errores: number
  membresiasNuevas: number
  membresiasActualizar: number
  porEstado: Record<string, number>
  gestionesPorCanal: Record<string, number>
  avisosPorTipo: Record<string, number>
  gruposHomonimos: number
}

export type SpeakerExistente = {
  id: string
  nombre: string
  empresa: string | null
  cargo: string | null
  email: string | null
  pais: string | null
}

export type MembresiaExistente = {
  speaker_id: string
  estado: EventoSpeakerEstado | null
  estado_motivo: string | null
  responsable_texto: string | null
  proximo_seguimiento_nota: string | null
  notas_internas: string | null
  pista_espacio: string | null
  requiere_viaticos: boolean | null
  datos_prospeccion: Record<string, unknown> | null
}

export type OpcionesPlan = {
  estadoDefault: EventoSpeakerEstado
  archivoNombre: string
  hojaNombre: string
}

/** Payload por fila hacia la RPC. */
export type FilaRpc = {
  fila_idx: number
  accion: 'crear' | 'actualizar' | 'omitir'
  speaker_id?: string | null
  nombre?: string | null
  empresa?: string | null
  cargo?: string | null
  pais?: string | null
  email?: string | null
  email_aprobado?: boolean
  estado?: EventoSpeakerEstado
  estado_motivo?: string | null
  sobrescribir_estado?: boolean
  requiere_viaticos?: boolean | null
  responsable_texto?: string | null
  proximo_seguimiento_nota?: string | null
  notas_internas?: string | null
  pista_espacio?: string | null
  datos_prospeccion?: SnapshotImportExcel
  gestiones?: GestionPlan[]
}
