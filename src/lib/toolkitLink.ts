/**
 * URL pública del toolkit de UNA participación.
 * Sin dominio del evento no hay link: no se inventa el host de GovTech.
 */

export function normalizarToolkitBaseUrl(
  value: string | null | undefined,
): string | null {
  if (value == null) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return trimmed
}

/** Vacío → null. Con texto, exige https y devuelve la base sin barra final. */
export function validarToolkitBaseUrl(value: string): string | null {
  const base = normalizarToolkitBaseUrl(value)
  if (!base) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new Error('La URL base del toolkit no es válida.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('La URL base del toolkit debe usar https.')
  }
  return base
}

export function toolkitUrl(
  baseUrl: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const base = normalizarToolkitBaseUrl(baseUrl)
  const slugLimpio = slug?.trim() ?? ''
  if (!base || !slugLimpio) return null
  return `${base}/${slugLimpio}`
}
