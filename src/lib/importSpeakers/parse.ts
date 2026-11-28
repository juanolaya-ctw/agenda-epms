import { loadSheetJs, type SheetJsModule } from './sheetjs'
import type { ArchivoParseado, CeldaCruda, FilaCruda, HojaParseada } from './tipos'
import { parseBoolCelda, parseFechaYmd } from './normalize'
import { autodetectarMapeo, scoreMapeo } from './mapeo'

export const MAX_FILAS = 5000
export const MAX_BYTES = 5 * 1024 * 1024

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportParseError'
  }
}

function celdaDesdeValor(raw: unknown): CeldaCruda {
  if (raw == null || raw === '') return { kind: 'empty' }
  if (typeof raw === 'boolean') return { kind: 'bool', value: raw }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const ymd = parseFechaYmd(raw)
    if (ymd) return { kind: 'date', ymd }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // SheetJS con cellDates a veces deja serial; si parece fecha Excel (>20000)
    if (raw > 20000 && raw < 80000) {
      const ymd = parseFechaYmd(raw)
      if (ymd) return { kind: 'date', ymd }
    }
    return { kind: 'number', value: raw }
  }
  const s = String(raw)
  const bool = parseBoolCelda(s)
  // No forzar bool en texto genérico salvo sí/no/true/false explícitos
  if (
    bool != null &&
    ['true', 'false', 'sí', 'si', 'no', 'yes', 'y', 'n', '1', '0'].includes(
      s.trim().toLowerCase(),
    )
  ) {
    return { kind: 'bool', value: bool }
  }
  const ymd = parseFechaYmd(s)
  if (ymd && /^\d{4}-\d{2}-\d{2}/.test(s.trim())) {
    return { kind: 'date', ymd }
  }
  return { kind: 'text', value: s }
}

function filaVacia(celdas: CeldaCruda[]): boolean {
  return celdas.every((c) => c.kind === 'empty')
}

function valorCrudo(c: CeldaCruda): unknown {
  if (c.kind === 'empty') return null
  if (c.kind === 'bool') return c.value
  if (c.kind === 'date') return c.ymd
  if (c.kind === 'number') return c.value
  return c.value
}

/** Parsea CSV con soporte de comillas, BOM y separador ,/; */
export function parseCsv(text: string): HojaParseada {
  let raw = text
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  const firstLine = raw.split(/\r?\n/, 1)[0] ?? ''
  const commas = (firstLine.match(/,/g) ?? []).length
  const semis = (firstLine.match(/;/g) ?? []).length
  const sep = semis > commas ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === sep) {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    if (ch === '\r') continue
    field += ch
  }
  // last field
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) {
    return { nombre: 'CSV', headers: [], filas: [] }
  }

  const headers = (rows[0] ?? []).map((h) => h.trim())
  const filas: FilaCruda[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] ?? []
    const celdas: CeldaCruda[] = []
    for (let c = 0; c < headers.length; c++) {
      celdas.push(celdaDesdeValor(cells[c] ?? ''))
    }
    if (filaVacia(celdas)) continue
    filas.push({ filaIdx: r + 1, celdas }) // 1-based sheet row (header=1)
  }

  if (filas.length > MAX_FILAS) {
    throw new ImportParseError(
      `El archivo supera el límite de ${MAX_FILAS.toLocaleString('es')} filas (${filas.length}).`,
    )
  }

  return { nombre: 'CSV', headers, filas }
}

function hojaDesdeSheet(
  XLSX: SheetJsModule,
  name: string,
  sheet: Record<string, unknown>,
): HojaParseada {
  const ref = sheet['!ref'] as string | undefined
  if (!ref) return { nombre: name, headers: [], filas: [] }
  const range = XLSX.utils.decode_range(ref)
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c })
    const cell = sheet[addr] as { v?: unknown; w?: string; t?: string } | undefined
    const v = cell?.w ?? cell?.v
    headers.push(v == null ? '' : String(v).trim())
  }

  const filas: FilaCruda[] = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const celdas: CeldaCruda[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr] as
        | { v?: unknown; w?: string; t?: string }
        | undefined
      if (!cell || cell.v == null || cell.v === '') {
        celdas.push({ kind: 'empty' })
        continue
      }
      if (cell.t === 'b' || typeof cell.v === 'boolean') {
        celdas.push({ kind: 'bool', value: Boolean(cell.v) })
        continue
      }
      if (cell.t === 'd' || cell.v instanceof Date) {
        const ymd = parseFechaYmd(cell.v)
        celdas.push(ymd ? { kind: 'date', ymd } : { kind: 'text', value: String(cell.v) })
        continue
      }
      if (cell.t === 'n' || typeof cell.v === 'number') {
        celdas.push(celdaDesdeValor(cell.v))
        continue
      }
      celdas.push(celdaDesdeValor(cell.v))
    }
    if (filaVacia(celdas)) continue
    filas.push({ filaIdx: r + 1, celdas }) // SheetJS 0-based → 1-based display
  }

  if (filas.length > MAX_FILAS) {
    throw new ImportParseError(
      `La hoja «${name}» supera el límite de ${MAX_FILAS.toLocaleString('es')} filas (${filas.length}).`,
    )
  }

  return { nombre: name, headers, filas }
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ArchivoParseado> {
  const XLSX = await loadSheetJs()
  const wb = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })
  const hojas: HojaParseada[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    hojas.push(hojaDesdeSheet(XLSX, name, sheet))
  }
  if (hojas.length === 0) {
    throw new ImportParseError('El libro no tiene hojas legibles.')
  }
  const hojaActiva = elegirHojaMejor(hojas)
  return { hojas, hojaActiva }
}

export function elegirHojaMejor(hojas: HojaParseada[]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < hojas.length; i++) {
    const h = hojas[i]!
    const sample = h.filas.slice(0, 30).map((f) => f.celdas.map(valorCrudo))
    const mapeo = autodetectarMapeo(h.headers, sample)
    const score = scoreMapeo(mapeo)
    // Prefer known CRM sheet names
    const nameBonus = /crm|speakers/i.test(h.nombre) ? 2 : 0
    const total = score + nameBonus
    if (total > bestScore) {
      bestScore = total
      best = i
    }
  }
  return best
}

export async function parseArchivo(
  file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<ArchivoParseado> {
  if (file.size > MAX_BYTES) {
    throw new ImportParseError(
      `El archivo supera el límite de ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
    )
  }
  const name = file.name.toLowerCase()
  const buf = await file.arrayBuffer()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = new TextDecoder('utf-8').decode(buf)
    const hoja = parseCsv(text)
    return { hojas: [hoja], hojaActiva: 0 }
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
    return parseXlsx(buf)
  }
  // sniff
  const head = new Uint8Array(buf.slice(0, 4))
  const isZip = head[0] === 0x50 && head[1] === 0x4b
  if (isZip) return parseXlsx(buf)
  const text = new TextDecoder('utf-8').decode(buf)
  const hoja = parseCsv(text)
  return { hojas: [hoja], hojaActiva: 0 }
}

export function celdaValor(c: CeldaCruda): unknown {
  return valorCrudo(c)
}
