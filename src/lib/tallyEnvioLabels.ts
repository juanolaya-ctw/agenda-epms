export const TALLY_ENVIO_ESTADOS = [
  'recibido',
  'auto_vinculado',
  'creado',
  'pendiente_revision',
  'aceptado',
  'rechazado',
  'formulario_desconocido',
  'invalido',
] as const

export type TallyEnvioEstado = (typeof TALLY_ENVIO_ESTADOS)[number]

export const TALLY_ENVIO_ESTADO_LABELS: Record<TallyEnvioEstado, string> = {
  recibido: 'Recibido',
  auto_vinculado: 'Vinculado',
  creado: 'Creado',
  pendiente_revision: 'Por revisar',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  formulario_desconocido: 'Formulario desconocido',
  invalido: 'Inválido',
}

export const TALLY_ENVIO_RAZON_LABELS: Record<string, string> = {
  email_exacto: 'Email exacto',
  email_exacto_con_conflictos: 'Email exacto con conflictos',
  email_otra_persona: 'Email de otra persona',
  'nombre+empresa': 'Mismo nombre y empresa',
  nombre_solo: 'Mismo nombre',
  multiples_candidatos: 'Varios candidatos por nombre',
  sin_coincidencia: 'Sin coincidencia',
  formulario_desconocido: 'Formulario desconocido',
  payload_invalido: 'Payload inválido',
}

export function labelEstadoTallyEnvio(estado: string): string {
  return (
    TALLY_ENVIO_ESTADO_LABELS[estado as TallyEnvioEstado] ?? estado
  )
}

export function labelRazonTallyEnvio(razon: string | null | undefined): string {
  if (!razon) return '—'
  return TALLY_ENVIO_RAZON_LABELS[razon] ?? razon
}

/** Agrupa estados para los chips de conteo en Settings. */
export function bucketEstadoTallyEnvio(
  estado: string,
): 'recibidos' | 'vinculados' | 'creados' | 'por_revisar' | 'invalidos' | 'otros' {
  switch (estado) {
    case 'recibido':
      return 'recibidos'
    case 'auto_vinculado':
      return 'vinculados'
    case 'creado':
      return 'creados'
    case 'pendiente_revision':
      return 'por_revisar'
    case 'invalido':
    case 'formulario_desconocido':
      return 'invalidos'
    default:
      return 'otros'
  }
}
