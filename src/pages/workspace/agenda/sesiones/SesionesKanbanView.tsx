import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  actualizarEstadoSesion,
  type SesionesData,
  type Sesion,
} from '@/hooks/useSesionesData'
import { FormatoBadge } from './badges'
import { formatDiaCorto, rangoHora } from './format'

const COLUMNAS = ['BORRADOR', 'CONFIRMADA', 'CANCELADA'] as const
type Estado = (typeof COLUMNAS)[number]

function SesionCard({ sesion }: { sesion: Sesion }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: sesion.id })
  const completo = sesion.speakersAsignados >= sesion.capacidadSpeakers
  const libres = Math.max(0, sesion.capacidadSpeakers - sesion.speakersAsignados)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        'cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <p className="mb-2 line-clamp-2 text-sm font-medium">{sesion.titulo}</p>
      <div className="mb-2">
        <FormatoBadge formato={sesion.formato} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDiaCorto(sesion.dia)} · {rangoHora(sesion.horaInicio, sesion.horaFin)}
      </p>
      <p className="text-xs text-muted-foreground">
        {sesion.escenarioNombre || 'Sin escenario'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            'text-xs tabular-nums',
            completo ? 'font-medium text-secondary' : 'text-muted-foreground',
          )}
        >
          {sesion.speakersAsignados}/{sesion.capacidadSpeakers} speakers
        </span>
        {libres > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {libres} spot{libres === 1 ? '' : 's'} disponible
            {libres === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
    </div>
  )
}

function Columna({
  estado,
  sesiones,
}: {
  estado: Estado
  sesiones: Sesion[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {estado}
        </h3>
        <Badge variant="outline">{sesiones.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-40 flex-col gap-2 rounded-lg border border-dashed border-border p-2 transition-colors',
          isOver && 'border-primary bg-muted/50',
        )}
      >
        {sesiones.map((sesion) => (
          <SesionCard key={sesion.id} sesion={sesion} />
        ))}
        {sesiones.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Sin sesiones
          </p>
        )}
      </div>
    </div>
  )
}

type SesionesKanbanViewProps = { data: SesionesData }

export function SesionesKanbanView({ data }: SesionesKanbanViewProps) {
  const { sesiones, loading, error, refetch } = data
  const [guardando, setGuardando] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const destino = over.id as Estado
    const sesion = sesiones.find((row) => row.id === active.id)
    if (!sesion || sesion.estado === destino) return

    setGuardando(true)
    const { error: updateError } = await actualizarEstadoSesion(
      sesion.id,
      destino,
    )
    setGuardando(false)
    if (updateError) {
      toast.error(`No se pudo mover la sesión: ${updateError}`)
      return
    }
    toast.success(`Sesión movida a ${destino}`)
    refetch()
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNAS.map((estado) => (
          <div key={estado} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 sm:grid-cols-3">
          {COLUMNAS.map((estado) => (
            <Columna
              key={estado}
              estado={estado}
              sesiones={sesiones.filter((row) => row.estado === estado)}
            />
          ))}
        </div>
      </DndContext>
      {guardando && (
        <p className="text-xs text-muted-foreground">Guardando cambio…</p>
      )}
    </div>
  )
}
