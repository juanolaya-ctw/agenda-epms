/**
 * Carga SheetJS (xlsx) desde el tarball oficial del CDN.
 * Dynamic import → no entra al chunk principal de la app.
 *
 * Versión pinned: 0.20.3 del CDN oficial sheetjs.com (no el paquete npm
 * histórico xlsx@0.18.5 con CVEs). URL del tarball ESM abajo.
 */

export type SheetJsWorkbook = {
  SheetNames: string[]
  Sheets: Record<string, SheetJsWorksheet>
}

export type SheetJsWorksheet = Record<string, unknown> & {
  '!ref'?: string
}

export type SheetJsUtils = {
  decode_range: (ref: string) => {
    s: { r: number; c: number }
    e: { r: number; c: number }
  }
  encode_cell: (addr: { r: number; c: number }) => string
}

export type SheetJsModule = {
  read: (
    data: ArrayBuffer | Uint8Array | string,
    opts?: Record<string, unknown>,
  ) => SheetJsWorkbook
  utils: SheetJsUtils
}

const SHEETJS_CDN =
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'

let cached: Promise<SheetJsModule> | null = null

export function loadSheetJs(): Promise<SheetJsModule> {
  if (!cached) {
    cached = import(/* @vite-ignore */ SHEETJS_CDN).then((mod) => {
      const m = mod as SheetJsModule & { default?: SheetJsModule }
      return (m.default ?? m) as SheetJsModule
    })
  }
  return cached
}

/** Solo para tests: resetear el cache del dynamic import. */
export function _resetSheetJsCacheForTests(): void {
  cached = null
}
