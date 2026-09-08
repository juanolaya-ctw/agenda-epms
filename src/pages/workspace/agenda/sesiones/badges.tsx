import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function FormatoBadge({ formato }: { formato: string | null }) {
  if (!formato) return <span className="text-muted-foreground">—</span>
  const normal = formato.toLowerCase()
  if (normal.includes('keynote'))
    return <Badge variant="secondary">{formato}</Badge>
  if (normal.includes('panel')) return <Badge>{formato}</Badge>
  if (normal.includes('workshop'))
    return <Badge className="bg-muted text-muted-foreground">{formato}</Badge>
  return <Badge variant="outline">{formato}</Badge>
}

const ESTADO_STYLES: Record<string, string> = {
  BORRADOR: 'bg-status-pending/20 text-foreground border border-status-pending/50',
  CONFIRMADA: 'bg-status-approved/20 text-foreground border border-status-approved/50',
  CANCELADA: 'bg-status-rejected/15 text-destructive border border-status-rejected/40',
}

export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <Badge
      className={cn(
        'font-medium',
        ESTADO_STYLES[estado] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {estado}
    </Badge>
  )
}
