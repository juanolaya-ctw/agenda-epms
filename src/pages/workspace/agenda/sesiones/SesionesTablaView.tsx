import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { eliminarSesion, useSesionesData, type Sesion } from '@/hooks/useSesionesData'
import { SesionFormDialog } from './SesionFormDialog'
import { EstadoBadge, FormatoBadge } from './badges'
import { formatDiaLargo } from './format'

const ESTADOS = ['BORRADOR', 'CONFIRMADA', 'CANCELADA'] as const
const TODOS = '__todos__'

type SortKey =
  | 'titulo'
  | 'formato'
  | 'track'
  | 'dia'
  | 'hora'
  | 'escenario'
  | 'capacidad'
  | 'estado'

type SortState = { key: SortKey; dir: 'asc' | 'desc' }

function sortValue(row: Sesion, key: SortKey): string | number {
  switch (key) {
    case 'titulo':
      return row.titulo.toLowerCase()
    case 'formato':
      return (row.formato ?? '').toLowerCase()
    case 'track':
      return (row.track ?? '').toLowerCase()
    case 'dia':
      return `${row.dia} ${row.horaInicio}`
    case 'hora':
      return row.horaInicio
    case 'escenario':
      return row.escenarioNombre.toLowerCase()
    case 'capacidad':
      return row.capacidadSpeakers === 0
        ? 0
        : row.speakersAsignados / row.capacidadSpeakers
    case 'estado':
      return row.estado
  }
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  )
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 9 }).map((__, cell) => (
            <TableCell key={cell}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

type SesionesTablaViewProps = {
  eventoId: string
  eventoRango: { inicio: string; fin: string }
}

export function SesionesTablaView({
  eventoId,
  eventoRango,
}: SesionesTablaViewProps) {
  const { sesiones, escenarios, tracks, formatos, loading, error, refetch } =
    useSesionesData(eventoId)

  const [busqueda, setBusqueda] = useState('')
  const [filtroEscenario, setFiltroEscenario] = useState<string>(TODOS)
  const [filtroEstado, setFiltroEstado] = useState<string>(TODOS)
  const [sort, setSort] = useState<SortState>({ key: 'dia', dir: 'asc' })

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [sesionActiva, setSesionActiva] = useState<Sesion | null>(null)
  const [aEliminar, setAEliminar] = useState<Sesion | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const filtered = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    const rows = sesiones.filter((row) => {
      if (term && !row.titulo.toLowerCase().includes(term)) return false
      if (filtroEscenario !== TODOS && row.escenarioId !== filtroEscenario)
        return false
      if (filtroEstado !== TODOS && row.estado !== filtroEstado) return false
      return true
    })

    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av < bv) return -1 * factor
      if (av > bv) return 1 * factor
      return 0
    })
  }, [sesiones, busqueda, filtroEscenario, filtroEstado, sort])

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  function openCreate() {
    setSheetMode('create')
    setSesionActiva(null)
    setSheetOpen(true)
  }

  function openEdit(sesion: Sesion) {
    setSheetMode('edit')
    setSesionActiva(sesion)
    setSheetOpen(true)
  }

  async function confirmEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    const { error: deleteError } = await eliminarSesion(aEliminar.id)
    setEliminando(false)
    setAEliminar(null)
    if (deleteError) {
      toast.error(`No se pudo eliminar: ${deleteError}`)
      return
    }
    toast.success('Sesión eliminada')
    refetch()
  }

  const sinSesiones = !loading && sesiones.length === 0
  const sinResultados = !loading && sesiones.length > 0 && filtered.length === 0

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título…"
              className="h-8 w-56"
            />
            <Select value={filtroEscenario} onValueChange={setFiltroEscenario}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Escenario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los escenarios</SelectItem>
                {escenarios.map((escenario) => (
                  <SelectItem key={escenario.id} value={escenario.id}>
                    {escenario.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los estados</SelectItem>
                {ESTADOS.map((estado) => (
                  <SelectItem key={estado} value={estado}>
                    {estado}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={openCreate}>
            <CalendarPlus /> Nueva sesión
          </Button>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {sinSesiones ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <CalendarPlus className="size-8 text-muted-foreground" />
            <p className="max-w-xs text-sm text-muted-foreground">
              No hay sesiones creadas aún. Crea la primera sesión para empezar.
            </p>
            <Button onClick={openCreate}>
              <CalendarPlus /> Nueva sesión
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Título" sortKey="titulo" sort={sort} onSort={handleSort} />
                  <SortHeader label="Formato" sortKey="formato" sort={sort} onSort={handleSort} />
                  <SortHeader label="Track" sortKey="track" sort={sort} onSort={handleSort} />
                  <SortHeader label="Día" sortKey="dia" sort={sort} onSort={handleSort} />
                  <SortHeader label="Hora" sortKey="hora" sort={sort} onSort={handleSort} />
                  <SortHeader label="Escenario" sortKey="escenario" sort={sort} onSort={handleSort} />
                  <SortHeader label="Capacidad" sortKey="capacidad" sort={sort} onSort={handleSort} />
                  <SortHeader label="Estado" sortKey="estado" sort={sort} onSort={handleSort} />
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <LoadingRows />}

                {sinResultados && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      Ninguna sesión coincide con los filtros.
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filtered.map((sesion) => {
                    const completo =
                      sesion.speakersAsignados >= sesion.capacidadSpeakers
                    return (
                      <TableRow
                        key={sesion.id}
                        onClick={() => openEdit(sesion)}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell className="max-w-[240px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate font-medium">
                                {sesion.titulo}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{sesion.titulo}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <FormatoBadge formato={sesion.formato} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sesion.track ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDiaLargo(sesion.dia)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {sesion.horaInicio && sesion.horaFin
                            ? `${sesion.horaInicio} – ${sesion.horaFin}`
                            : '—'}
                        </TableCell>
                        <TableCell>{sesion.escenarioNombre || '—'}</TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            completo && 'font-medium text-secondary',
                          )}
                        >
                          {sesion.speakersAsignados}/{sesion.capacidadSpeakers}
                        </TableCell>
                        <TableCell>
                          <EstadoBadge estado={sesion.estado} />
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Editar sesión"
                              onClick={() => openEdit(sesion)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Eliminar sesión"
                              onClick={() => setAEliminar(sesion)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <SesionFormDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        sesion={sesionActiva}
        escenarios={escenarios}
        tracks={tracks}
        formatos={formatos}
        eventoRango={eventoRango}
        onSaved={refetch}
      />

      <AlertDialog
        open={aEliminar !== null}
        onOpenChange={(open) => !open && setAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmEliminar()
              }}
              disabled={eliminando}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
