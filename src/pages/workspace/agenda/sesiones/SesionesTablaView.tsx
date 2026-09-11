import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  Check,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
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
import { InlineText } from '@/components/InlineText'
import {
  TableFilters,
  filaPasaFiltros,
  type FiltroActivo,
  type FiltroColumna,
} from '@/components/table-filters/TableFilters'
import { useOptimisticOverrides } from '@/hooks/useOptimisticOverrides'
import {
  actualizarCampoSesion,
  actualizarCampoSlot,
  eliminarSesion,
  IDIOMAS_SESION,
  reasignarEscenarioSesion,
  slotOcupadoPorOtraSesion,
  type SesionesData,
  type Sesion,
} from '@/hooks/useSesionesData'
import { SesionFormDialog } from './SesionFormDialog'
import { SpeakersNames } from './SpeakersAvatarStack'
import { estadoDotClass, FormatoBadge } from './badges'

const SIN_TRACK = '__sin_track__'
const toStr = (v: unknown): string => (v == null ? '' : String(v))

function getValSesion(s: Sesion, campo: string): unknown {
  if (campo === '_conCupo') {
    return s.capacidadSpeakers - s.speakersAsignados > 0
  }
  return (s as unknown as Record<string, unknown>)[campo]
}

type SortKey =
  | 'titulo'
  | 'formato'
  | 'track'
  | 'idioma'
  | 'dia'
  | 'horaInicio'
  | 'horaFin'
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
    case 'idioma':
      return row.idioma.toLowerCase()
    case 'dia':
      return `${row.dia} ${row.horaInicio}`
    case 'horaInicio':
      return row.horaInicio
    case 'horaFin':
      return row.horaFin
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
          {Array.from({ length: 12 }).map((__, cell) => (
            <TableCell key={cell}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

function CapacidadCell({
  capacidad,
  asignados,
  onSave,
}: {
  capacidad: number
  asignados: number
  onSave: (n: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(capacidad))
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)

  const n = Number(draft)
  const rangoInvalido = !Number.isInteger(n) || n < 1 || n > 4
  const menorQueAsignados = Number.isInteger(n) && n < asignados
  const invalid = rangoInvalido || menorQueAsignados
  const msg = menorQueAsignados
    ? `Esta sesión ya tiene ${asignados} speakers asignados. La capacidad no puede ser menor a ${asignados}.`
    : rangoInvalido
      ? 'La capacidad debe estar entre 1 y 4.'
      : ''

  async function commit() {
    if (saving) return
    if (n === capacidad) {
      setEditing(false)
      return
    }
    if (invalid) return
    setSaving(true)
    try {
      await onSave(n)
      setOk(true)
      setTimeout(() => setOk(false), 1200)
    } catch {
      setDraft(String(capacidad))
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(capacidad))
          setEditing(true)
        }}
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5 tabular-nums transition-colors hover:cursor-pointer hover:bg-muted/40',
          asignados >= capacidad && 'font-medium text-secondary',
        )}
      >
        {asignados}/{capacidad}
        {ok && <Check className="size-3 text-status-approved" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={4}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(String(capacidad))
            setEditing(false)
          }
        }}
        disabled={saving}
        aria-invalid={invalid}
        title={msg || undefined}
        className={cn(
          'h-7 w-14 text-xs',
          invalid &&
            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
        )}
      />
      {saving && (
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}

type SesionesTablaViewProps = {
  data: SesionesData
  eventoRango: { inicio: string; fin: string }
}

export function SesionesTablaView({ data, eventoRango }: SesionesTablaViewProps) {
  const {
    sesiones,
    escenarios,
    tracks,
    formatos,
    estados,
    loading,
    error,
    refetch,
  } = data

  const colorPorEstado = useMemo(
    () => new Map(estados.map((e) => [e.nombre, e.color])),
    [estados],
  )

  // Edición inline: overrides optimistas + refetch para mantener las 3
  // subvistas (tabla/kanban/calendario) consistentes.
  const ov = useOptimisticOverrides<
    | 'titulo'
    | 'track'
    | 'idioma'
    | 'dia'
    | 'horaInicio'
    | 'horaFin'
    | 'escenarioId'
    | 'capacidadSpeakers'
    | 'estado'
  >()

  const [conflictoEsc, setConflictoEsc] = useState<{
    sesion: Sesion
    escenarioId: string
  } | null>(null)
  const [aplicandoEsc, setAplicandoEsc] = useState(false)

  async function aplicarEscenario(s: Sesion, escenarioId: string) {
    await ov.commit(s.id, 'escenarioId', escenarioId, s.escenarioId, async () => {
      const { error: e } = await reasignarEscenarioSesion(
        s.id,
        escenarioId,
        s.dia,
        s.horaInicio,
        s.horaFin,
      )
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarEscenario(s: Sesion, escenarioId: string) {
    if (escenarioId === s.escenarioId) return
    const chk = await slotOcupadoPorOtraSesion(
      escenarioId,
      s.dia,
      s.horaInicio,
      s.id,
    )
    if (chk.error) {
      toast.error(`No se pudo verificar: ${chk.error}`)
      return
    }
    if (chk.ocupado) {
      setConflictoEsc({ sesion: s, escenarioId })
      return
    }
    await aplicarEscenario(s, escenarioId)
  }

  async function confirmarConflictoEsc() {
    if (!conflictoEsc) return
    setAplicandoEsc(true)
    try {
      await aplicarEscenario(conflictoEsc.sesion, conflictoEsc.escenarioId)
      setConflictoEsc(null)
    } finally {
      setAplicandoEsc(false)
    }
  }

  async function guardarCapacidad(s: Sesion, n: number) {
    await ov.commit(
      s.id,
      'capacidadSpeakers',
      n,
      s.capacidadSpeakers,
      async () => {
        const { error: e } = await actualizarCampoSesion(s.id, {
          capacidad_speakers: n,
        })
        if (e) throw new Error(e)
      },
    )
    refetch()
  }

  async function guardarEstado(s: Sesion, estado: string) {
    if (estado === s.estado) return
    await ov.commit(s.id, 'estado', estado, s.estado, async () => {
      const { error: e } = await actualizarCampoSesion(s.id, { estado })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarTitulo(s: Sesion, v: string) {
    await ov.commit(s.id, 'titulo', v, s.titulo, async () => {
      const { error: e } = await actualizarCampoSesion(s.id, { titulo: v })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarTrack(s: Sesion, value: string) {
    const track = value === SIN_TRACK ? null : value
    await ov.commit(s.id, 'track', track, s.track, async () => {
      const { error: e } = await actualizarCampoSesion(s.id, { track })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarIdioma(s: Sesion, value: string) {
    if (value === s.idioma) return
    await ov.commit(s.id, 'idioma', value, s.idioma, async () => {
      const { error: e } = await actualizarCampoSesion(s.id, { idioma: value })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarDia(s: Sesion, v: string) {
    if (!v || v === s.dia) return
    await ov.commit(s.id, 'dia', v, s.dia, async () => {
      const { error: e } = await actualizarCampoSlot(s.slotId, { dia: v })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarHoraInicio(s: Sesion, v: string) {
    if (!v || v === toStr(ov.get(s.id, 'horaInicio', s.horaInicio))) return
    const finActual = toStr(ov.get(s.id, 'horaFin', s.horaFin))
    if (finActual && v >= finActual) {
      toast.error('La hora de inicio debe ser menor a la hora de fin.')
      return
    }
    await ov.commit(s.id, 'horaInicio', v, s.horaInicio, async () => {
      const { error: e } = await actualizarCampoSlot(s.slotId, {
        hora_inicio: v,
      })
      if (e) throw new Error(e)
    })
    refetch()
  }

  async function guardarHoraFin(s: Sesion, v: string) {
    if (!v || v === toStr(ov.get(s.id, 'horaFin', s.horaFin))) return
    const inicioActual = toStr(ov.get(s.id, 'horaInicio', s.horaInicio))
    if (inicioActual && v <= inicioActual) {
      toast.error('La hora de fin debe ser mayor a la hora de inicio.')
      return
    }
    await ov.commit(s.id, 'horaFin', v, s.horaFin, async () => {
      const { error: e } = await actualizarCampoSlot(s.slotId, {
        hora_fin: v,
      })
      if (e) throw new Error(e)
    })
    refetch()
  }

  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<FiltroActivo[]>([])
  const [sort, setSort] = useState<SortState>({ key: 'dia', dir: 'asc' })

  const filterColumns: FiltroColumna[] = useMemo(
    () => [
      {
        campo: 'formato',
        etiqueta: 'Formato',
        tipo: 'select',
        opciones: formatos.map((f) => f.nombre),
      },
      {
        campo: 'track',
        etiqueta: 'Track',
        tipo: 'select',
        opciones: tracks.map((t) => t.nombre),
      },
      {
        campo: 'idioma',
        etiqueta: 'Idioma',
        tipo: 'select',
        opciones: [...IDIOMAS_SESION],
      },
      { campo: 'dia', etiqueta: 'Día', tipo: 'fecha' },
      {
        campo: 'escenarioNombre',
        etiqueta: 'Escenario',
        tipo: 'select',
        opciones: escenarios.map((e) => e.nombre),
      },
      {
        campo: 'estado',
        etiqueta: 'Estado',
        tipo: 'select',
        opciones: estados.map((e) => e.nombre),
      },
      { campo: '_conCupo', etiqueta: 'Cupo disponible', tipo: 'boolean' },
    ],
    [formatos, tracks, escenarios, estados],
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [sesionActiva, setSesionActiva] = useState<Sesion | null>(null)
  const [aEliminar, setAEliminar] = useState<Sesion | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const filtered = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    const rows = sesiones.filter((row) => {
      if (term && !row.titulo.toLowerCase().includes(term)) return false
      return filaPasaFiltros((campo) => getValSesion(row, campo), filtros)
    })

    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av < bv) return -1 * factor
      if (av > bv) return 1 * factor
      return 0
    })
  }, [sesiones, busqueda, filtros, sort])

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
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por título…"
              className="h-8 w-56"
            />
            <TableFilters
              columnas={filterColumns}
              filtros={filtros}
              onChange={setFiltros}
            />
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
                  <SortHeader label="Idioma" sortKey="idioma" sort={sort} onSort={handleSort} />
                  <SortHeader label="Día" sortKey="dia" sort={sort} onSort={handleSort} />
                  <SortHeader label="Hora inicio" sortKey="horaInicio" sort={sort} onSort={handleSort} />
                  <SortHeader label="Hora fin" sortKey="horaFin" sort={sort} onSort={handleSort} />
                  <SortHeader label="Escenario" sortKey="escenario" sort={sort} onSort={handleSort} />
                  <SortHeader label="Capacidad" sortKey="capacidad" sort={sort} onSort={handleSort} />
                  <TableHead className="min-w-[260px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Speakers
                  </TableHead>
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
                    <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                      Ninguna sesión coincide con los filtros.
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filtered.map((sesion) => {
                    return (
                      <TableRow
                        key={sesion.id}
                        onClick={() => openEdit(sesion)}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell
                          className="max-w-[240px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <InlineText
                            value={toStr(
                              ov.get(sesion.id, 'titulo', sesion.titulo),
                            )}
                            placeholder="Sin título"
                            displayClassName="font-medium"
                            onSave={(v) => guardarTitulo(sesion, v)}
                          />
                        </TableCell>
                        <TableCell>
                          <FormatoBadge formato={sesion.formato} />
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Select
                            value={
                              toStr(ov.get(sesion.id, 'track', sesion.track)) ||
                              SIN_TRACK
                            }
                            onValueChange={(v) => void guardarTrack(sesion, v)}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={SIN_TRACK}>Sin track</SelectItem>
                              {tracks.map((t) => (
                                <SelectItem key={t.id} value={t.nombre}>
                                  {t.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Select
                            value={toStr(
                              ov.get(sesion.id, 'idioma', sesion.idioma),
                            )}
                            onValueChange={(v) => void guardarIdioma(sesion, v)}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IDIOMAS_SESION.map((idioma) => (
                                <SelectItem key={idioma} value={idioma}>
                                  {idioma}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            type="date"
                            value={toStr(ov.get(sesion.id, 'dia', sesion.dia))}
                            min={eventoRango.inicio || undefined}
                            max={eventoRango.fin || undefined}
                            onChange={(e) => void guardarDia(sesion, e.target.value)}
                            className="h-7 w-[9.5rem] text-xs"
                          />
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap tabular-nums"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sesion.slotId ? (
                            <Input
                              type="time"
                              value={toStr(
                                ov.get(
                                  sesion.id,
                                  'horaInicio',
                                  sesion.horaInicio,
                                ),
                              )}
                              onChange={(e) =>
                                void guardarHoraInicio(sesion, e.target.value)
                              }
                              className="h-7 w-[6rem] text-xs"
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap tabular-nums"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sesion.slotId ? (
                            <Input
                              type="time"
                              value={toStr(
                                ov.get(sesion.id, 'horaFin', sesion.horaFin),
                              )}
                              onChange={(e) =>
                                void guardarHoraFin(sesion, e.target.value)
                              }
                              className="h-7 w-[6rem] text-xs"
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={toStr(
                              ov.get(
                                sesion.id,
                                'escenarioId',
                                sesion.escenarioId,
                              ),
                            )}
                            onValueChange={(v) =>
                              void guardarEscenario(sesion, v)
                            }
                          >
                            <SelectTrigger className="h-7 w-40 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {escenarios.map((esc) => (
                                <SelectItem key={esc.id} value={esc.id}>
                                  {esc.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <CapacidadCell
                            capacidad={Number(
                              ov.get(
                                sesion.id,
                                'capacidadSpeakers',
                                sesion.capacidadSpeakers,
                              ),
                            )}
                            asignados={sesion.speakersAsignados}
                            onSave={(n) => guardarCapacidad(sesion, n)}
                          />
                        </TableCell>
                        <TableCell className="min-w-[260px] max-w-[420px]">
                          <SpeakersNames speakers={sesion.speakers} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const estadoActual = toStr(
                              ov.get(sesion.id, 'estado', sesion.estado),
                            )
                            return (
                              <Select
                                value={estadoActual}
                                onValueChange={(v) =>
                                  void guardarEstado(sesion, v)
                                }
                              >
                                <SelectTrigger
                                  className="h-7 min-w-[140px] text-xs"
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <SelectValue placeholder="Estado">
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          'inline-block size-2 shrink-0 rounded-full',
                                          estadoDotClass(
                                            colorPorEstado.get(estadoActual),
                                          ),
                                        )}
                                      />
                                      {estadoActual || 'Estado'}
                                    </span>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent position="popper" align="start">
                                  {!estados.some(
                                    (e) => e.nombre === estadoActual,
                                  ) &&
                                    estadoActual && (
                                      <SelectItem value={estadoActual}>
                                        {estadoActual}
                                      </SelectItem>
                                    )}
                                  {estados.map((e) => (
                                    <SelectItem key={e.id} value={e.nombre}>
                                      <span className="flex items-center gap-2">
                                        <span
                                          className={cn(
                                            'inline-block size-2 shrink-0 rounded-full',
                                            estadoDotClass(e.color),
                                          )}
                                        />
                                        {e.nombre}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          })()}
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
        estados={estados}
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

      <AlertDialog
        open={conflictoEsc !== null}
        onOpenChange={(open) => !open && setConflictoEsc(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ya existe una sesión en ese escenario y horario
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Continuar de todas formas? Ambas sesiones quedarán en el mismo
              escenario, día y hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoEsc}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={aplicandoEsc}
              onClick={(e) => {
                e.preventDefault()
                void confirmarConflictoEsc()
              }}
            >
              {aplicandoEsc ? 'Aplicando…' : 'Continuar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
