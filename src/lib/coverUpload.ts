/** Tipos aceptados por el input de cover de evento. */
export const COVER_ACCEPT = 'image/png,image/jpeg,image/webp'

/** Tamaño máximo del cover (5 MB). */
export const COVER_MAX_BYTES = 5 * 1024 * 1024

const COVER_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Valida un archivo de cover antes de subir a Storage.
 * @returns mensaje de error o `null` si es válido.
 */
export function validarCoverFile(file: File): string | null {
  if (!file.type.startsWith('image/') || !COVER_MIME.has(file.type)) {
    return 'El cover debe ser una imagen PNG, JPEG o WebP'
  }
  if (file.size > COVER_MAX_BYTES) {
    return 'El cover no puede superar 5 MB'
  }
  return null
}
