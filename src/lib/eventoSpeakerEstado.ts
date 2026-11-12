export const EVENTO_SPEAKER_ESTADOS = [
  'SIN_CLASIFICAR',
  'PENDIENTE_CONTACTAR',
  'CONTACTADO',
  'EN_CONVERSACION',
  'CONFIRMADO',
  'NO_DISPONIBLE',
  'DESCARTADO',
] as const

export type EventoSpeakerEstado = (typeof EVENTO_SPEAKER_ESTADOS)[number]

/** Default al asociar / crear membresía nueva. */
export const ESTADO_ALTA_NUEVA: EventoSpeakerEstado = 'PENDIENTE_CONTACTAR'

/** Default backfill / filas legacy. */
export const ESTADO_LEGACY: EventoSpeakerEstado = 'SIN_CLASIFICAR'

export const ESTADO_LABELS: Record<EventoSpeakerEstado, string> = {
  SIN_CLASIFICAR: 'Sin clasificar',
  PENDIENTE_CONTACTAR: 'Pendiente de contactar',
  CONTACTADO: 'Contactado',
  EN_CONVERSACION: 'En conversación',
  CONFIRMADO: 'Confirmado',
  NO_DISPONIBLE: 'No disponible',
  DESCARTADO: 'Descartado',
}

export const isEventoSpeakerEstado = (
  value: string,
): value is EventoSpeakerEstado =>
  (EVENTO_SPEAKER_ESTADOS as readonly string[]).includes(value)

/** Estados que cuentan en pipeline operativo (excluye legacy). */
export const ESTADOS_PIPELINE_OPERATIVO: EventoSpeakerEstado[] =
  EVENTO_SPEAKER_ESTADOS.filter((e) => e !== 'SIN_CLASIFICAR')
