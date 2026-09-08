import { Badge } from '@/components/ui/badge'

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
