import type { Speaker } from '@/hooks/useSpeakersData'

const HEADERS = [
  'nombre',
  'cargo',
  'empresa',
  'pais',
  'ciudad',
  'email',
  'telefono',
  'linkedin_url',
  'tipo_documento',
  'numero_documento',
  'email_secundario',
  'foto_url',
  'fuente',
  'sesiones',
  'eventos',
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

function fechaHoyLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildSpeakersCsvFilename(): string {
  return `speakers-crm-${fechaHoyLocal()}.csv`
}

export function buildSpeakersCsv(speakers: Speaker[]): string {
  const lines: string[] = [HEADERS.join(',')]
  const sorted = [...speakers].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )

  for (const sp of sorted) {
    const eventos =
      sp.eventosAsociados.length > 0
        ? sp.eventosAsociados.map((e) => e.nombre).join('; ')
        : sp.eventosParticipados.join('; ')
    lines.push(
      [
        cell(sp.nombre),
        cell(sp.cargo),
        cell(sp.empresa),
        cell(sp.pais),
        cell(sp.ciudad),
        cell(sp.email),
        cell(sp.telefono),
        cell(sp.linkedin_url),
        cell(sp.tipo_documento),
        cell(sp.numero_documento),
        cell(sp.email_secundario),
        cell(sp.foto_url),
        cell(sp.fuente),
        cell(sp.sesionesEnEvento),
        cell(eventos),
      ].join(','),
    )
  }

  return lines.join('\r\n')
}

/** Exporta la vista actual (p.ej. filtrada) del CRM. */
export function downloadSpeakersCsv(speakers: Speaker[]): void {
  const csv = buildSpeakersCsv(speakers)
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildSpeakersCsvFilename()
  a.click()
  URL.revokeObjectURL(url)
}
