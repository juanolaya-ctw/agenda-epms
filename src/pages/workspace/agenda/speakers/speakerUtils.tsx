import { Badge } from '@/components/ui/badge'
import type { ChecklistItem, PropiedadCustom } from '@/hooks/useSpeakersData'

const TOOLKIT_BASE_URL = 'https://agenda.colombiatech.co/toolkit'

export function toolkitUrl(slug: string): string {
  return `${TOOLKIT_BASE_URL}/${slug}`
}

export function asChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is ChecklistItem =>
      typeof item === 'object' && item !== null && 'label' in item,
  )
}

/** Resumen corto del valor de una propiedad para mostrar en la tabla. */
export function resumenValor(prop: PropiedadCustom, valor: unknown): string {
  if (prop.tipo === 'checkbox') {
    return valor === true || valor === 'true' ? 'Sí' : 'No'
  }
  if (prop.tipo === 'checklist') {
    const items = asChecklist(valor)
    if (items.length === 0) return '0/0'
    return `${items.filter((i) => i.checked).length}/${items.length} completado`
  }
  if (valor == null || valor === '') return '—'
  return String(valor)
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function FuenteBadge({ fuente }: { fuente: string | null }) {
  if (fuente === 'tally')
    return (
      <Badge className="bg-status-approved/20 text-foreground border border-status-approved/50">
        Tally
      </Badge>
    )
  if (fuente === 'admin_manual')
    return <Badge className="bg-muted text-muted-foreground">Manual</Badge>
  return <span className="text-xs text-muted-foreground">{fuente ?? '—'}</span>
}
