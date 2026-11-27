export const GESTION_TIPOS = [
  'correo',
  'linkedin',
  'referencia',
  'institucion',
  'whatsapp',
  'llamada',
  'otro',
] as const

export type GestionTipo = (typeof GESTION_TIPOS)[number]

export const GESTION_TIPO_LABELS: Record<GestionTipo, string> = {
  correo: 'Correo',
  linkedin: 'LinkedIn',
  referencia: 'Referencia',
  institucion: 'Institución',
  whatsapp: 'WhatsApp',
  llamada: 'Llamada',
  otro: 'Otro',
}

/** Nombre de ícono Lucide para cada tipo (UI). */
export const GESTION_TIPO_ICONOS: Record<GestionTipo, string> = {
  correo: 'Mail',
  linkedin: 'Link2',
  referencia: 'UserPlus',
  institucion: 'Building2',
  whatsapp: 'MessageCircle',
  llamada: 'Phone',
  otro: 'CircleDot',
}

export function isGestionTipo(value: string): value is GestionTipo {
  return (GESTION_TIPOS as readonly string[]).includes(value)
}
