import type { FiltroColumna } from '@/components/table-filters/TableFilters'
import type { PropiedadCustom, Speaker } from '@/hooks/useSpeakersData'

export const FUENTES_SPEAKER = ['tally', 'admin_manual', 'import_sheet']

/** Convierte una propiedad custom del evento en una columna filtrable.
 *  `checklist` se omite (queda legacy). */
export function propiedadFiltroColumna(
  prop: PropiedadCustom,
): FiltroColumna | null {
  const campo = `prop:${prop.id}`
  switch (prop.tipo) {
    case 'checkbox':
      return { campo, etiqueta: prop.nombre, tipo: 'boolean' }
    case 'select':
      return {
        campo,
        etiqueta: prop.nombre,
        tipo: 'select',
        opciones: prop.opciones,
      }
    case 'texto':
      return { campo, etiqueta: prop.nombre, tipo: 'texto' }
    case 'fecha':
      return { campo, etiqueta: prop.nombre, tipo: 'fecha' }
    default:
      return null
  }
}

/** Resuelve el valor de un `campo` de filtro para una fila de speaker.
 *  Soporta campos base, pseudo-campos (`_conSesiones`, `_conEventos`) y
 *  propiedades custom (`prop:<id>`). */
export function getValSpeaker(
  sp: Speaker,
  campo: string,
  valoresPorSpeaker: Record<string, Record<string, unknown>>,
): unknown {
  if (campo === '_conSesiones') return sp.sesionesEnEvento > 0
  if (campo === '_conEventos') return sp.eventosParticipados.length > 0
  if (campo.startsWith('prop:')) {
    return valoresPorSpeaker[sp.id]?.[campo.slice(5)]
  }
  return (sp as unknown as Record<string, unknown>)[campo]
}

/** Valores únicos no vacíos de un campo string, ordenados. */
export function opcionesUnicas(
  filas: Speaker[],
  campo: keyof Speaker,
): string[] {
  const set = new Set<string>()
  for (const f of filas) {
    const v = f[campo]
    if (typeof v === 'string' && v.trim() !== '') set.add(v.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
