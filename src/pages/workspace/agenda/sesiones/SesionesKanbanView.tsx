import { useMemo, useState } from 'react'
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
  type EstadoColor,
  type SesionesData,
  type Sesion,
} from '@/hooks/useSesionesData'
import { estadoDotClass, FormatoBadge } from './badges'
import { diasDelEvento, formatDiaCorto, rangoHora } from './format'
import { filtrarSesionesVista, VistaFiltros } from './VistaFiltros'

type ColumnaEstado = { nombre: string; color: EstadoColor }

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
  estado: ColumnaEstado
  sesiones: Sesion[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado.nombre })
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block size-2 shrink-0 rounded-full',
            estadoDotClass(estado.color),
          )}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {estado.nombre}
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

type SesionesKanbanViewProps = {
  data: SesionesData
  eventoRango: { inicio: string; fin: string }
}

export function SesionesKanbanView({
  data,
  eventoRango,
}: SesionesKanbanViewProps) {
  const { sesiones, escenarios, estados, loading, error, refetch } = data
  const [guardando, setGuardando] = useState(false)
  const [filtroEscenarioId, setFiltroEscenarioId] = useState<string | null>(null)
  const [filtroDia, setFiltroDia] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const dias = useMemo(
    () =>
      diasDelEvento(
        eventoRango.inicio,
        eventoRango.fin,
        sesiones.map((s) => s.dia),
      ),
    [eventoRango.inicio, eventoRango.fin, sesiones],
  )

  const sesionesVisibles = useMemo(
    () => filtrarSesionesVista(sesiones, filtroEscenarioId, filtroDia),
    [sesiones, filtroEscenarioId, filtroDia],
  )

  // Columnas desde el catálogo del evento (ordenadas por `orden`). Si el
  // evento aún no tiene estados configurados, se derivan de los valores
  // presentes en las sesiones para no ocultar nada.
  const columnas: ColumnaEstado[] = useMemo(() => {
    if (estados.length > 0) {
      return estados.map((e) => ({ nombre: e.nombre, color: e.color }))
    }
    const vistos = new Set<string>()
    const derivadas: ColumnaEstado[] = []
    for (const s of sesiones) {
      if (s.estado && !vistos.has(s.estado)) {
        vistos.add(s.estado)
        derivadas.push({ nombre: s.estado, color: 'gray' })
      }
    }
    return derivadas
  }, [estados, sesiones])

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const destino = String(over.id)
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
      <div className="flex flex-col gap-3">
        <VistaFiltros
          escenarios={escenarios}
          dias={dias}
          escenarioId={filtroEscenarioId}
          dia={filtroDia}
          onEscenarioChange={setFiltroEscenarioId}
          onDiaChange={setFiltroDia}
        />
        <div className="flex flex-col gap-4 sm:flex-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <VistaFiltros
        escenarios={escenarios}
        dias={dias}
        escenarioId={filtroEscenarioId}
        dia={filtroDia}
        onEscenarioChange={setFiltroEscenarioId}
        onDiaChange={setFiltroDia}
      />
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {columnas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Este evento no tiene estados de sesión configurados. Agrégalos en
          Configuración del workspace.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-4 sm:flex-row">
            {columnas.map((estado) => (
              <Columna
                key={estado.nombre}
                estado={estado}
                sesiones={sesionesVisibles.filter(
                  (row) => row.estado === estado.nombre,
                )}
              />
            ))}
          </div>
        </DndContext>
      )}
      {guardando && (
        <p className="text-xs text-muted-foreground">Guardando cambio…</p>
      )}
    </div>
  )
}
