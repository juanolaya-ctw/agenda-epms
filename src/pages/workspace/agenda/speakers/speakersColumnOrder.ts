export const SPEAKERS_COLUMN_ORDER_KEY = 'speakersColumnOrder'

export const SPEAKERS_ACCIONES_ID = 'acciones'

export const SPEAKERS_FIXED_COLUMNS = [
  { id: 'foto', label: 'Foto' },
  { id: 'foto_url', label: 'URL foto' },
  { id: 'nombre', label: 'Nombre' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'empresa', label: 'Empresa' },
  { id: 'pais', label: 'País' },
  { id: 'email', label: 'Email' },
  { id: 'telefono', label: 'Teléfono' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'ciudad', label: 'Ciudad' },
  { id: 'tipo_documento', label: 'Tipo Doc.' },
  { id: 'numero_documento', label: 'Núm. Doc.' },
  { id: 'email_secundario', label: 'Email secundario' },
  { id: 'sesiones', label: 'Sesiones' },
  { id: 'fuente', label: 'Fuente' },
  { id: 'toolkit', label: 'Toolkit' },
] as const

export type SpeakersFixedColumnId = (typeof SPEAKERS_FIXED_COLUMNS)[number]['id']

export function propColumnId(propiedadId: string): string {
  return `prop:${propiedadId}`
}

export function propiedadIdFromColumn(columnId: string): string | null {
  return columnId.startsWith('prop:') ? columnId.slice(5) : null
}

export function defaultSpeakersColumnOrder(propiedadIds: string[]): string[] {
  return [
    ...SPEAKERS_FIXED_COLUMNS.map((c) => c.id),
    ...propiedadIds.map(propColumnId),
    SPEAKERS_ACCIONES_ID,
  ]
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return list
  next.splice(to, 0, item)
  return next
}

/** Conserva el orden guardado, descarta ids obsoletos y agrega columnas nuevas
 *  (propiedades custom) justo antes de Acciones si esa columna sigue en la lista. */
export function mergeColumnOrder(
  saved: string[] | null,
  defaults: string[],
): string[] {
  if (!saved || saved.length === 0) return defaults
  const defaultSet = new Set(defaults)
  const seen = new Set<string>()
  const merged: string[] = []
  for (const id of saved) {
    if (!defaultSet.has(id) || seen.has(id)) continue
    merged.push(id)
    seen.add(id)
  }
  const missing = defaults.filter((id) => !seen.has(id))
  if (missing.length === 0) return merged
  const accionesIdx = merged.indexOf(SPEAKERS_ACCIONES_ID)
  if (accionesIdx >= 0) {
    merged.splice(accionesIdx, 0, ...missing)
    return merged
  }
  return [...merged, ...missing]
}

export function loadColumnOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(SPEAKERS_COLUMN_ORDER_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !Array.isArray(parsed) ||
      !parsed.every((id) => typeof id === 'string')
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveColumnOrder(ids: string[]): void {
  try {
    localStorage.setItem(SPEAKERS_COLUMN_ORDER_KEY, JSON.stringify(ids))
  } catch {
    // localStorage no disponible
  }
}
