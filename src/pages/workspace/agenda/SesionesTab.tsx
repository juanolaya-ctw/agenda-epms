import { lazy, Suspense, useState } from 'react'
import { useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useSesionesData } from '@/hooks/useSesionesData'
import { SesionesTablaView } from './sesiones/SesionesTablaView'

// Tabla es la subvista por defecto; Kanban (trae @dnd-kit) y Calendario
// (layout de grilla) solo se descargan al abrirlas.
const SesionesKanbanView = lazy(() =>
  import('./sesiones/SesionesKanbanView').then((m) => ({
    default: m.SesionesKanbanView,
  })),
)
const SesionesCalendarioView = lazy(() =>
  import('./sesiones/SesionesCalendarioView').then((m) => ({
    default: m.SesionesCalendarioView,
  })),
)

const SUBVISTAS = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'calendario', label: 'Calendario' },
] as const

type SubVista = (typeof SUBVISTAS)[number]['id']

export function SesionesTab() {
  const [subVista, setSubVista] = useState<SubVista>('tabla')
  const { id } = useParams()
  const { workspace } = useWorkspace()

  const eventoRango = {
    inicio: workspace?.fechaInicio ?? '',
    fin: workspace?.fechaFin ?? '',
  }

  // Un solo fetch compartido por las 3 subvistas: cambiar de subvista ya
  // no re-dispara la cascada de queries.
  const data = useSesionesData(id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1">
        {SUBVISTAS.map((sv) => (
          <button
            key={sv.id}
            type="button"
            onClick={() => setSubVista(sv.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              subVista === sv.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {sv.label}
          </button>
        ))}
      </div>

      {!id ? (
        <div>Selecciona un evento para ver las sesiones.</div>
      ) : (
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-muted-foreground">
              Cargando…
            </div>
          }
        >
          {subVista === 'tabla' && (
            <SesionesTablaView data={data} eventoRango={eventoRango} />
          )}
          {subVista === 'kanban' && (
            <SesionesKanbanView data={data} eventoRango={eventoRango} />
          )}
          {subVista === 'calendario' && (
            <SesionesCalendarioView
              data={data}
              eventoId={id}
              eventoRango={eventoRango}
            />
          )}
        </Suspense>
      )}
    </div>
  )
}
