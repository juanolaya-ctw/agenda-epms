import {
  Building2,
  CircleDot,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { Gestion, GestionConEvento } from '@/hooks/useGestionesData'
import { timestampAYmdBogota } from '@/lib/bogotaDate'
import {
  GESTION_TIPO_LABELS,
  type GestionTipo,
} from '@/lib/gestionTipos'

const ICONOS: Record<GestionTipo, LucideIcon> = {
  correo: Mail,
  linkedin: Link2,
  referencia: UserPlus,
  institucion: Building2,
  whatsapp: MessageCircle,
  llamada: Phone,
  otro: CircleDot,
}

type GestionesListProps = {
  gestiones: Array<Gestion | GestionConEvento>
  nombresPorUsuario: Record<string, string>
  /** Muestra nombre del evento (CRM global). */
  mostrarEvento?: boolean
  emptyText?: string
}

export function GestionesList({
  gestiones,
  nombresPorUsuario,
  mostrarEvento = false,
  emptyText = 'Sin gestiones registradas.',
}: GestionesListProps) {
  if (gestiones.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {gestiones.map((g) => {
        const Icon = ICONOS[g.tipo] ?? CircleDot
        const ymd = timestampAYmdBogota(g.ocurrida_at) ?? '—'
        const proxima = timestampAYmdBogota(g.proxima_at)
        const autor =
          (g.creado_por && nombresPorUsuario[g.creado_por]) || '—'
        const eventoNombre =
          mostrarEvento && 'eventoNombre' in g
            ? g.eventoNombre
            : null
        return (
          <li
            key={g.id}
            className="rounded-md border border-border px-2.5 py-2 text-xs"
          >
            <div className="flex items-start gap-2">
              <Icon
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {GESTION_TIPO_LABELS[g.tipo]} · {ymd}
                </p>
                {eventoNombre && (
                  <p className="text-muted-foreground">{eventoNombre}</p>
                )}
                {g.nota && (
                  <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                    {g.nota}
                  </p>
                )}
                {proxima && (
                  <p className="mt-0.5 text-muted-foreground">
                    Próximo: {proxima}
                  </p>
                )}
                <p className="mt-0.5 text-muted-foreground">Por: {autor}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
