const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

/** Tipo servible, o null si no es un bitmap permitido (svg incluido). */
export function imageMediaType(bytes: Uint8Array, contentType: string): string | null {
  const declared = normalizeDeclared(contentType)
  if (declared === 'image/svg+xml' || declared === 'image/svg') return null
  const sniffed = sniff(bytes)
  if (!sniffed || !ALLOWED.has(sniffed)) return null
  if (declared !== sniffed) return null
  return sniffed
}

function normalizeDeclared(contentType: string): string {
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg' || base === 'image/pjpeg') return 'image/jpeg'
  return base
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  return null
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[start + i] ?? 0)
  return out
}
