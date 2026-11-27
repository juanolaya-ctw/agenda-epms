import {
  labelCampoActividad,
  labelEstadoActividad,
} from '@/lib/actividadLabels'
import { timestampAYmdBogota } from '@/lib/bogotaDate'

export type NombresPorUsuario = Readonly<Record<string, string>>

function unwrapJsonb(value: unknown): unknown {
  if (value === null || value === undefined) return null
  // PostgREST a veces entrega scalars JSON ya parseados; strings con comillas
  // dobles son el literal JSON de un text column vía to_jsonb.
  if (typeof value === 'string') return value
  return value
}

function formatScalar(
  value: unknown,
  campo: string,
  nombres: NombresPorUsuario,
): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'

  if (campo === 'estado' && typeof value === 'string') {
    return labelEstadoActividad(value) ?? value
  }

  if (campo === 'responsable_id' && typeof value === 'string') {
    return nombres[value]?.trim() || 'Equipo'
  }

  if (
    (campo === 'proximo_seguimiento_at' || campo.endsWith('_at')) &&
    typeof value === 'string'
  ) {
    return timestampAYmdBogota(value) ?? value
  }

  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const t = value.trim()
    return t || '—'
  }

  if (typeof value === 'object') {
    return resumirObjeto(value as Record<string, unknown>, campo)
  }

  return String(value)
}

function resumirObjeto(
  obj: Record<string, unknown>,
  campo: string,
): string {
  if (campo === 'membresia' || 'accion' in obj) {
    const accion = obj.accion
    if (accion === 'asociado') {
      const estado =
        typeof obj.estado === 'string'
          ? labelEstadoActividad(obj.estado) ?? obj.estado
          : null
      return estado ? `Asociado · ${estado}` : 'Asociado'
    }
    if (accion === 'desasociado') return 'Desasociado'
    if (accion === 'alta') return 'Alta de speaker'
  }

  if (campo === 'datos_prospeccion' || 'nombre' in obj) {
    const partes = [
      typeof obj.nombre === 'string' ? obj.nombre : null,
      typeof obj.cargo === 'string' ? obj.cargo : null,
      typeof obj.empresa === 'string' ? obj.empresa : null,
      typeof obj.pais === 'string' ? obj.pais : null,
    ].filter((p): p is string => !!p && p.trim().length > 0)
    if (partes.length > 0) return partes.join(' · ')
  }

  try {
    const s = JSON.stringify(obj)
    return s.length > 120 ? `${s.slice(0, 117)}…` : s
  } catch {
    return '—'
  }
}

/** Formatea un valor jsonb de speaker_cambios para la UI. */
export function formatValorActividad(
  value: unknown,
  campo: string,
  nombres: NombresPorUsuario = {},
): string {
  return formatScalar(unwrapJsonb(value), campo, nombres)
}

export function formatCambioValores(
  campo: string,
  anterior: unknown,
  nuevo: unknown,
  nombres: NombresPorUsuario = {},
): { campoLabel: string; anterior: string; nuevo: string } {
  return {
    campoLabel: labelCampoActividad(campo),
    anterior: formatValorActividad(anterior, campo, nombres),
    nuevo: formatValorActividad(nuevo, campo, nombres),
  }
}
