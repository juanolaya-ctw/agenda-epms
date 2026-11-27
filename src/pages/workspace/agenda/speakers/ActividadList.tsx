import { CircleDot, History, NotebookPen } from 'lucide-react'
import { formatCambioValores } from '@/lib/actividadFormat'
import { labelOrigenActividad } from '@/lib/actividadLabels'
import { timestampAFechaHoraBogota, timestampAYmdBogota } from '@/lib/bogotaDate'
import { GESTION_TIPO_LABELS } from '@/lib/gestionTipos'
import {
  mensajeVacioActividad,
  nombreActorActividad,
  type ActividadItem,
} from '@/lib/actividadTimeline'

type ActividadListProps = {
  items: ActividadItem[]
  nombresPorUsuario: Record<string, string>
  /** Muestra nombre del evento cuando aplica. */
  mostrarEvento?: boolean
}

export function ActividadList({
  items,
  nombresPorUsuario,
  mostrarEvento = false,
}: ActividadListProps) {
  const vacio = mensajeVacioActividad(items)
  if (vacio) {
    return <p className="text-xs text-muted-foreground">{vacio}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        if (item.kind === 'gestion') {
          const g = item.gestion
          const cuando =
            timestampAFechaHoraBogota(g.created_at) ??
            timestampAYmdBogota(g.ocurrida_at) ??
            '—'
          const autor = nombreActorActividad(
            g.creado_por,
            'edicion_equipo',
            nombresPorUsuario,
          )
          const proxima = timestampAYmdBogota(g.proxima_at)
          return (
            <li
              key={item.id}
              className="rounded-md border border-border px-2.5 py-2 text-xs"
            >
              <div className="flex items-start gap-2">
                <NotebookPen
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Gestión · {GESTION_TIPO_LABELS[g.tipo]} · {cuando}
                  </p>
                  {mostrarEvento && item.eventoNombre && (
                    <p className="text-muted-foreground">{item.eventoNombre}</p>
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
        }

        const c = item.cambio
        const cuando = timestampAFechaHoraBogota(c.created_at) ?? '—'
        const { campoLabel, anterior, nuevo } = formatCambioValores(
          c.campo,
          c.valor_anterior,
          c.valor_nuevo,
          nombresPorUsuario,
        )
        const actor = nombreActorActividad(
          c.actor_id,
          c.origen,
          nombresPorUsuario,
        )
        const Icon = c.campo === 'alta' || c.campo === 'membresia' ? History : CircleDot
        return (
          <li
            key={item.id}
            className="rounded-md border border-border px-2.5 py-2 text-xs"
          >
            <div className="flex items-start gap-2">
              <Icon
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {campoLabel} · {cuando}
                </p>
                {mostrarEvento && item.eventoNombre && (
                  <p className="text-muted-foreground">{item.eventoNombre}</p>
                )}
                {c.campo !== 'alta' && (
                  <p className="mt-0.5 text-muted-foreground">
                    <span className="line-through opacity-70">{anterior}</span>
                    {' → '}
                    <span>{nuevo}</span>
                  </p>
                )}
                {c.campo === 'alta' && (
                  <p className="mt-0.5 text-muted-foreground">{nuevo}</p>
                )}
                <p className="mt-0.5 text-muted-foreground">
                  Por: {actor} · {labelOrigenActividad(c.origen)}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
