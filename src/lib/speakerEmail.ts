/** Normalización y validación de email de speakers (pool global). */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Vacío / solo espacios → null.
 * Valor presente → lower(trim). No inventa correos.
 */
export const normalizeSpeakerEmail = (
  value: string | null | undefined,
): string | null => {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toLowerCase()
}

export const isValidSpeakerEmail = (normalized: string | null): boolean => {
  if (normalized == null) return true
  return EMAIL_RE.test(normalized)
}

/** Para formularios: null → '' en el input. */
export const emailToFormValue = (email: string | null | undefined): string =>
  email ?? ''
