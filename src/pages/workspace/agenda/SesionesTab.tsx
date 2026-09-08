import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { SesionesTablaView } from './sesiones/SesionesTablaView'
import { SesionesKanbanView } from './sesiones/SesionesKanbanView'
import { SesionesCalendarioView } from './sesiones/SesionesCalendarioView'

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
        <>
          {subVista === 'tabla' && (
            <SesionesTablaView eventoId={id} eventoRango={eventoRango} />
          )}
          {subVista === 'kanban' && <SesionesKanbanView eventoId={id} />}
          {subVista === 'calendario' && (
            <SesionesCalendarioView eventoId={id} eventoRango={eventoRango} />
          )}
        </>
      )}
    </div>
  )
}
