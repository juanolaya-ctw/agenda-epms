import {
  ESTADO_LABELS,
  isEventoSpeakerEstado,
} from '@/lib/eventoSpeakerEstado'

export const ACTIVIDAD_ORIGENES = [
  'edicion_equipo',
  'tally',
  'merge',
  'import_excel',
  'sistema',
] as const

export type ActividadOrigen = (typeof ACTIVIDAD_ORIGENES)[number]

export const ACTIVIDAD_ORIGEN_LABELS: Record<ActividadOrigen, string> = {
  edicion_equipo: 'Edición de equipo',
  tally: 'Tally',
  merge: 'Merge',
  import_excel: 'Import Excel',
  sistema: 'Sistema',
}

export const ACTIVIDAD_CAMPO_LABELS: Record<string, string> = {
  alta: 'Alta',
  membresia: 'Membresía',
  nombre: 'Nombre',
  email: 'Email',
  email_secundario: 'Email secundario',
  telefono: 'Teléfono',
  linkedin_url: 'LinkedIn',
  foto_url: 'Foto',
  tipo_documento: 'Tipo de documento',
  numero_documento: 'Número de documento',
  bio: 'Bio',
  pais: 'País',
  ciudad: 'Ciudad',
  cargo: 'Cargo',
  empresa: 'Empresa',
  estado: 'Estado',
  estado_motivo: 'Motivo de estado',
  responsable_id: 'Responsable',
  responsable_texto: 'Responsable (texto)',
  proximo_seguimiento_at: 'Próximo seguimiento',
  proximo_seguimiento_nota: 'Nota de seguimiento',
  requiere_viaticos: 'Requiere viáticos',
  viaticos_nota: 'Nota de viáticos',
  pista_espacio: 'Pista / Espacio',
  notas_internas: 'Notas internas',
  datos_prospeccion: 'Datos de prospección',
}

export function labelCampoActividad(campo: string): string {
  return ACTIVIDAD_CAMPO_LABELS[campo] ?? campo
}

export function labelOrigenActividad(origen: string): string {
  if ((ACTIVIDAD_ORIGENES as readonly string[]).includes(origen)) {
    return ACTIVIDAD_ORIGEN_LABELS[origen as ActividadOrigen]
  }
  return origen
}

export function labelEstadoActividad(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (isEventoSpeakerEstado(value)) return ESTADO_LABELS[value]
  return null
}

export function isActividadOrigen(value: string): value is ActividadOrigen {
  return (ACTIVIDAD_ORIGENES as readonly string[]).includes(value)
}
