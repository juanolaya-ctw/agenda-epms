import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EstadoColor } from '@/hooks/useSesionesData'

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

// Colores del catálogo (estados_sesion.color) → clases de badge, reusando
// los tokens `status-*` de la paleta del proyecto.
const COLOR_BADGE: Record<EstadoColor, string> = {
  gray: 'bg-muted text-muted-foreground border border-border',
  yellow:
    'bg-status-pending/20 text-foreground border border-status-pending/50',
  green:
    'bg-status-approved/20 text-foreground border border-status-approved/50',
  red: 'bg-status-rejected/15 text-destructive border border-status-rejected/40',
  blue: 'bg-status-review/20 text-foreground border border-status-review/50',
}

// Colores del catálogo → clase de fondo sólido (para puntos y headers).
const COLOR_DOT: Record<EstadoColor, string> = {
  gray: 'bg-muted-foreground/50',
  yellow: 'bg-status-pending',
  green: 'bg-status-approved',
  red: 'bg-status-rejected',
  blue: 'bg-status-review',
}

export function estadoBadgeClass(color: EstadoColor | undefined): string {
  return COLOR_BADGE[color ?? 'gray'] ?? COLOR_BADGE.gray
}

export function estadoDotClass(color: EstadoColor | undefined): string {
  return COLOR_DOT[color ?? 'gray'] ?? COLOR_DOT.gray
}

// Fallback por nombre para llamadas que aún no pasan color del catálogo.
const ESTADO_STYLES_LEGACY: Record<string, string> = {
  BORRADOR: COLOR_BADGE.yellow,
  CONFIRMADA: COLOR_BADGE.green,
  CANCELADA: COLOR_BADGE.red,
}

export function EstadoBadge({
  estado,
  color,
}: {
  estado: string
  color?: EstadoColor
}) {
  const className =
    color !== undefined
      ? estadoBadgeClass(color)
      : (ESTADO_STYLES_LEGACY[estado] ?? COLOR_BADGE.gray)
  return <Badge className={cn('font-medium', className)}>{estado}</Badge>
}
