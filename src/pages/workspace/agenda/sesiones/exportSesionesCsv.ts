import type { Sesion } from '@/hooks/useSesionesData'

const HEADERS = [
  'titulo',
  'formato',
  'track',
  'idioma',
  'dia',
  'hora_inicio',
  'hora_fin',
  'escenario',
  'capacidad',
  'speaker_nombre',
  'speaker_rol',
  'speaker_cargo',
  'speaker_empresa',
  'speaker_email',
  'speaker_foto_url',
] as const

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function cell(value: string | number | null | undefined): string {
  if (value == null) return ''
  return escapeCsv(String(value))
}

/** Slug para el nombre del archivo: "GovTech Summit | 2026" → "govtech-summit-2026" */
export function slugEvento(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'evento'
}

function fechaHoyLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildSesionesCsvFilename(eventoNombre: string): string {
  return `sesiones-${slugEvento(eventoNombre)}-${fechaHoyLocal()}.csv`
}

/** Una fila por speaker. Sesiones sin speakers: una fila con columnas de speaker vacías. Sin estado. */
export function buildSesionesCsv(sesiones: Sesion[]): string {
  const lines: string[] = [HEADERS.join(',')]

  const sorted = [...sesiones].sort((a, b) => {
    const da = `${a.dia} ${a.horaInicio}`
    const db = `${b.dia} ${b.horaInicio}`
    if (da < db) return -1
    if (da > db) return 1
    return a.titulo.localeCompare(b.titulo)
  })

  for (const s of sorted) {
    const base = [
      cell(s.titulo),
      cell(s.formato),
      cell(s.track),
      cell(s.idioma),
      cell(s.dia),
      cell(s.horaInicio),
      cell(s.horaFin),
      cell(s.escenarioNombre),
      cell(s.capacidadSpeakers),
    ]

    if (s.speakers.length === 0) {
      lines.push(
        [
          ...base,
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
          cell(''),
        ].join(','),
      )
      continue
    }

    for (const sp of s.speakers) {
      lines.push(
        [
          ...base,
          cell(sp.nombre),
          cell(sp.rol),
          cell(sp.cargo),
          cell(sp.empresa),
          cell(sp.email),
          cell(sp.fotoUrl),
        ].join(','),
      )
    }
  }

  return lines.join('\r\n')
}

export function downloadSesionesCsv(
  sesiones: Sesion[],
  eventoNombre: string,
): void {
  const csv = buildSesionesCsv(sesiones)
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildSesionesCsvFilename(eventoNombre)
  a.click()
  URL.revokeObjectURL(url)
}
