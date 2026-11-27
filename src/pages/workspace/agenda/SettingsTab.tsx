import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowLeft, GripVertical, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'
import { validarToolkitBaseUrl } from '@/lib/toolkitLink'
import { cn } from '@/lib/utils'
import type { EstadoColor } from '@/hooks/useSesionesData'
import { COLORES_ESCENARIO_PALETTE } from '@/hooks/useSesionesData'
import { estadoDotClass } from './sesiones/badges'

type CatalogItem = { id: string; nombre: string }

type CatalogTable = 'escenarios' | 'formatos' | 'tracks'

type EstadoRow = {
  id: string
  nombre: string
  orden: number
  color: EstadoColor
  cuentaParaCupos: boolean
}

const ESTADO_COLORS: { value: EstadoColor; label: string }[] = [
  { value: 'gray', label: 'Gris' },
  { value: 'yellow', label: 'Amarillo' },
  { value: 'green', label: 'Verde' },
  { value: 'red', label: 'Rojo' },
  { value: 'blue', label: 'Azul' },
]

const COLORES_VALIDOS = new Set(ESTADO_COLORS.map((c) => c.value))

type EstadoDbRow = {
  id: string
  nombre: string | null
  orden: number | null
  color: string | null
  cuenta_para_cupos: boolean | null
}

function normalizeEstado(row: EstadoDbRow): EstadoRow {
  return {
    id: row.id,
    nombre: row.nombre ?? '',
    orden: row.orden ?? 0,
    color: COLORES_VALIDOS.has(row.color as EstadoColor)
      ? (row.color as EstadoColor)
      : 'gray',
    cuentaParaCupos: row.cuenta_para_cupos ?? true,
  }
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  if (item === undefined) return list
  next.splice(to, 0, item)
  return next
}

function CatalogEditor({
  title,
  addLabel,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string
  addLabel: string
  placeholder: string
  items: CatalogItem[]
  onAdd: (nombre: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const nombre = draft.trim()
    if (!nombre || busy) return
    setBusy(true)
    try {
      await onAdd(nombre)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="space-y-1">
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground">Ninguno todavía.</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-md bg-muted px-2 py-1.5 text-sm"
          >
            <span>{item.nombre}</span>
            <button
              type="button"
              aria-label={`Eliminar ${item.nombre}`}
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => void onRemove(item.id)}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder={placeholder}
          className="h-8 flex-1"
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void add()}
          disabled={busy || !draft.trim()}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  )
}

function EstadoSortableRow({
  estado,
  onUpdateColor,
  onToggleCuenta,
  onRemove,
}: {
  estado: EstadoRow
  onUpdateColor: (id: string, color: EstadoColor) => Promise<void>
  onToggleCuenta: (id: string, value: boolean) => Promise<void>
  onRemove: (estado: EstadoRow) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: estado.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: estado.id })

  return (
    <li
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={cn(
        'flex flex-col gap-1.5 rounded-md bg-muted px-2 py-1.5 text-sm',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Reordenar ${estado.nombre}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-3.5" />
        </button>
        <span
          className={cn(
            'inline-block size-2.5 shrink-0 rounded-full',
            estadoDotClass(estado.color),
          )}
        />
        <span className="flex-1 truncate">{estado.nombre}</span>
        <Select
          value={estado.color}
          onValueChange={(value) =>
            void onUpdateColor(estado.id, value as EstadoColor)
          }
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADO_COLORS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block size-2 rounded-full',
                      estadoDotClass(c.value),
                    )}
                  />
                  {c.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          aria-label={`Eliminar ${estado.nombre}`}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          onClick={() => onRemove(estado)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <label className="flex items-center gap-2 pl-[50px] text-xs text-muted-foreground">
        <Checkbox
          checked={estado.cuentaParaCupos}
          onCheckedChange={(value) =>
            void onToggleCuenta(estado.id, value === true)
          }
        />
        Contar para cupos disponibles
      </label>
    </li>
  )
}

function EstadosEditor({
  estados,
  onAdd,
  onUpdateColor,
  onToggleCuenta,
  onRemove,
  onReorder,
}: {
  estados: EstadoRow[]
  onAdd: (nombre: string) => Promise<void>
  onUpdateColor: (id: string, color: EstadoColor) => Promise<void>
  onToggleCuenta: (id: string, value: boolean) => Promise<void>
  onRemove: (estado: EstadoRow) => void
  onReorder: (estadosReordenados: EstadoRow[]) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const activeEstado = estados.find((e) => e.id === activeId) ?? null

  async function add() {
    const nombre = draft.trim()
    if (!nombre || busy) return
    setBusy(true)
    try {
      await onAdd(nombre)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = estados.findIndex((e) => e.id === active.id)
    const to = estados.findIndex((e) => e.id === over.id)
    if (from < 0 || to < 0) return
    void onReorder(arrayMove(estados, from, to))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Estados de sesión</p>
      {estados.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguno todavía.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <ul className="space-y-1">
            {estados.map((estado) => (
              <EstadoSortableRow
                key={estado.id}
                estado={estado}
                onUpdateColor={onUpdateColor}
                onToggleCuenta={onToggleCuenta}
                onRemove={onRemove}
              />
            ))}
          </ul>
          <DragOverlay>
            {activeEstado ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-sm shadow-lg">
                <GripVertical className="size-3.5 text-muted-foreground" />
                <span
                  className={cn(
                    'inline-block size-2.5 shrink-0 rounded-full',
                    estadoDotClass(activeEstado.color),
                  )}
                />
                <span className="truncate">{activeEstado.nombre}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder="Nombre del estado"
          className="h-8 flex-1"
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void add()}
          disabled={busy || !draft.trim()}
        >
          Agregar estado
        </Button>
      </div>
    </div>
  )
}

export function SettingsTab() {
  const { id: eventoId } = useParams()
  const navigate = useNavigate()
  const { workspace, updateWorkspace, removeWorkspace } = useWorkspace()

  const [nombre, setNombre] = useState(workspace?.nombre ?? '')
  const [fechaInicio, setFechaInicio] = useState(workspace?.fechaInicio ?? '')
  const [fechaFin, setFechaFin] = useState(workspace?.fechaFin ?? '')
  const [toolkitBaseUrl, setToolkitBaseUrl] = useState('')
  const [tallyFormId, setTallyFormId] = useState('')
  const [tallyToken, setTallyToken] = useState<string | null>(null)
  const [tallyActivo, setTallyActivo] = useState(true)
  const [guardandoTally, setGuardandoTally] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const [escenarios, setEscenarios] = useState<CatalogItem[]>([])
  const [formatos, setFormatos] = useState<CatalogItem[]>([])
  const [tracks, setTracks] = useState<CatalogItem[]>([])
  const [estados, setEstados] = useState<EstadoRow[]>([])
  const [estadoAEliminar, setEstadoAEliminar] = useState<
    (EstadoRow & { count: number }) | null
  >(null)
  const [borrandoEstado, setBorrandoEstado] = useState(false)

  useEffect(() => {
    if (!workspace) return
    setNombre(workspace.nombre)
    setFechaInicio(workspace.fechaInicio)
    setFechaFin(workspace.fechaFin)
  }, [workspace])

  useEffect(() => {
    if (!eventoId) return
    let cancelled = false
    async function load() {
      const [esc, fmt, trk, est, eventoRow, tallyRow] = await Promise.all([
        supabase
          .from('escenarios')
          .select('id, nombre')
          .eq('evento_id', eventoId)
          .order('nombre'),
        supabase
          .from('formatos')
          .select('id, nombre')
          .eq('evento_id', eventoId)
          .order('nombre'),
        supabase
          .from('tracks')
          .select('id, nombre')
          .eq('evento_id', eventoId)
          .order('nombre'),
        supabase
          .from('estados_sesion')
          .select('id, nombre, orden, color, cuenta_para_cupos')
          .eq('evento_id', eventoId)
          .order('orden'),
        supabase
          .from('eventos')
          .select('toolkit_base_url')
          .eq('id', eventoId)
          .maybeSingle(),
        supabase
          .from('tally_formularios')
          .select('tally_form_id, webhook_token, activo')
          .eq('evento_id', eventoId)
          .maybeSingle(),
      ])
      if (cancelled) return
      if (eventoRow.error) toast.error(`Toolkit: ${eventoRow.error.message}`)
      if (tallyRow.error) toast.error(`Tally: ${tallyRow.error.message}`)
      if (!eventoRow.error) {
        setToolkitBaseUrl(
          (eventoRow.data?.toolkit_base_url as string | null) ?? '',
        )
      }
      if (!tallyRow.error && tallyRow.data) {
        const row = tallyRow.data as {
          tally_form_id: string
          webhook_token: string
          activo: boolean
        }
        setTallyFormId(row.tally_form_id)
        setTallyToken(row.webhook_token)
        setTallyActivo(row.activo)
      } else if (!tallyRow.error) {
        setTallyFormId('')
        setTallyToken(null)
        setTallyActivo(true)
      }
      if (esc.error) toast.error(`Escenarios: ${esc.error.message}`)
      if (fmt.error) toast.error(`Formatos: ${fmt.error.message}`)
      if (trk.error) toast.error(`Tracks: ${trk.error.message}`)
      if (est.error) toast.error(`Estados: ${est.error.message}`)
      setEscenarios((esc.data as CatalogItem[] | null) ?? [])
      setFormatos((fmt.data as CatalogItem[] | null) ?? [])
      setTracks((trk.data as CatalogItem[] | null) ?? [])
      setEstados(
        ((est.data ?? []) as EstadoDbRow[])
          .map((r) => normalizeEstado(r))
          .sort((a, b) => a.orden - b.orden),
      )
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventoId])

  async function handleGuardar() {
    if (!eventoId) return
    const nextNombre = nombre.trim()
    if (!nextNombre || !fechaInicio || !fechaFin) {
      toast.error('Nombre y fechas son obligatorios.')
      return
    }
    let toolkitUrl: string | null
    try {
      toolkitUrl = validarToolkitBaseUrl(toolkitBaseUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('eventos')
        .update({
          nombre: nextNombre,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          toolkit_base_url: toolkitUrl,
        })
        .eq('id', eventoId)
      if (error) throw new Error(error.message)
      updateWorkspace(eventoId, {
        nombre: nextNombre,
        fechaInicio,
        fechaFin,
      })
      toast.success('Workspace actualizado')
    } catch (err) {
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  async function guardarTally() {
    if (!eventoId) return
    const formId = tallyFormId.trim()
    if (!/^[A-Za-z0-9]+$/.test(formId)) {
      toast.error('El id del formulario Tally es el código de la URL (solo letras y números).')
      return
    }
    setGuardandoTally(true)
    try {
      const payload = {
        evento_id: eventoId,
        tally_form_id: formId,
        activo: tallyActivo,
        nombre: workspace?.nombre ?? null,
      }
      const { data, error } = await supabase
        .from('tally_formularios')
        .upsert(payload, { onConflict: 'evento_id' })
        .select('tally_form_id, webhook_token, activo')
        .single()
      if (error) throw new Error(error.message)
      const row = data as {
        tally_form_id: string
        webhook_token: string
        activo: boolean
      }
      setTallyFormId(row.tally_form_id)
      setTallyToken(row.webhook_token)
      setTallyActivo(row.activo)
      toast.success('Formulario Tally guardado')
    } catch (err) {
      toast.error(
        `No se pudo guardar el formulario: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setGuardandoTally(false)
    }
  }

  const webhookTally = tallyToken
    ? `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/tally-webhook?token=${tallyToken}`
    : null

  async function copiarWebhook() {
    if (!webhookTally) return
    try {
      await navigator.clipboard.writeText(webhookTally)
      toast.success('URL del webhook copiada')
    } catch {
      toast.error('No se pudo copiar la URL')
    }
  }

  async function confirmEliminar() {
    if (!eventoId) return
    setEliminando(true)
    try {
      const { error } = await supabase.from('eventos').delete().eq('id', eventoId)
      if (error) throw new Error(error.message)
      removeWorkspace(eventoId)
      toast.success('Workspace eliminado')
      navigate('/home')
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
      setEliminando(false)
    }
  }

  async function addCatalog(table: CatalogTable, nombreItem: string) {
    if (!eventoId) return
    const payload: Record<string, unknown> = {
      evento_id: eventoId,
      nombre: nombreItem,
    }
    if (table === 'escenarios') {
      payload.color =
        COLORES_ESCENARIO_PALETTE[
          escenarios.length % COLORES_ESCENARIO_PALETTE.length
        ]
    }
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select('id, nombre')
      .single()
    if (error) throw new Error(error.message)
    const item = data as CatalogItem
    const set =
      table === 'escenarios'
        ? setEscenarios
        : table === 'formatos'
          ? setFormatos
          : setTracks
    set((prev) => [...prev, item].sort((a, b) => a.nombre.localeCompare(b.nombre)))
  }

  async function removeCatalog(table: CatalogTable, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    const set =
      table === 'escenarios'
        ? setEscenarios
        : table === 'formatos'
          ? setFormatos
          : setTracks
    set((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleAdd(table: CatalogTable, nombreItem: string) {
    try {
      await addCatalog(table, nombreItem)
    } catch (err) {
      toast.error(
        `No se pudo agregar: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function handleRemove(table: CatalogTable, id: string) {
    try {
      await removeCatalog(table, id)
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function handleReorderEstados(estadosReordenados: EstadoRow[]) {
    const previous = estados
    const next = estadosReordenados.map((estado, index) => ({
      ...estado,
      orden: index,
    }))
    setEstados(next)
    try {
      const updates = next.map((estado) =>
        supabase
          .from('estados_sesion')
          .update({ orden: estado.orden })
          .eq('id', estado.id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw new Error(failed.error.message)
    } catch (err) {
      setEstados(previous)
      toast.error(
        `No se pudo reordenar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  async function handleAddEstado(nombreItem: string) {
    if (!eventoId) return
    try {
      const orden =
        estados.reduce((max, e) => Math.max(max, e.orden), -1) + 1
      const { data, error } = await supabase
        .from('estados_sesion')
        .insert({ evento_id: eventoId, nombre: nombreItem, orden, color: 'gray' })
        .select('id, nombre, orden, color, cuenta_para_cupos')
        .single()
      if (error) throw new Error(error.message)
      setEstados((prev) =>
        [...prev, normalizeEstado(data as EstadoDbRow)].sort(
          (a, b) => a.orden - b.orden,
        ),
      )
    } catch (err) {
      toast.error(
        `No se pudo agregar: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function handleUpdateColorEstado(id: string, color: EstadoColor) {
    try {
      const { error } = await supabase
        .from('estados_sesion')
        .update({ color })
        .eq('id', id)
      if (error) throw new Error(error.message)
      setEstados((prev) =>
        prev.map((e) => (e.id === id ? { ...e, color } : e)),
      )
    } catch (err) {
      toast.error(
        `No se pudo cambiar el color: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  async function handleToggleCuenta(id: string, value: boolean) {
    try {
      const { error } = await supabase
        .from('estados_sesion')
        .update({ cuenta_para_cupos: value })
        .eq('id', id)
      if (error) throw new Error(error.message)
      setEstados((prev) =>
        prev.map((e) => (e.id === id ? { ...e, cuentaParaCupos: value } : e)),
      )
    } catch (err) {
      toast.error(
        `No se pudo actualizar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  async function borrarEstado(id: string) {
    const { error } = await supabase
      .from('estados_sesion')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    setEstados((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleRemoveEstado(estado: EstadoRow) {
    if (!eventoId) return
    try {
      const { count, error } = await supabase
        .from('sesiones')
        .select(
          'id, slot:slots!inner(escenario:escenarios!inner(evento_id))',
          { count: 'exact', head: true },
        )
        .eq('estado', estado.nombre)
        .eq('slot.escenario.evento_id', eventoId)
      if (error) throw new Error(error.message)

      if ((count ?? 0) > 0) {
        setEstadoAEliminar({ ...estado, count: count ?? 0 })
        return
      }
      await borrarEstado(estado.id)
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function confirmEliminarEstado() {
    if (!estadoAEliminar) return
    setBorrandoEstado(true)
    try {
      await borrarEstado(estadoAEliminar.id)
      setEstadoAEliminar(null)
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBorrandoEstado(false)
    }
  }

  const nombreEvento = workspace?.nombre || 'este workspace'

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() =>
            navigate(eventoId ? `/workspace/${eventoId}/agenda` : '/home')
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a {workspace?.nombre ?? 'el workspace'}
        </button>
        <h1 className="text-2xl font-semibold">Configuración del evento</h1>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-white p-6">
        <h2 className="text-sm font-semibold">Información del evento</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-nombre">Nombre</Label>
          <Input
            id="ws-nombre"
            className="w-full"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-inicio">Fecha inicio</Label>
            <Input
              id="ws-inicio"
              type="date"
              className="w-full"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-fin">Fecha fin</Label>
            <Input
              id="ws-fin"
              type="date"
              className="w-full"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-toolkit">URL base del toolkit</Label>
          <Input
            id="ws-toolkit"
            className="w-full"
            value={toolkitBaseUrl}
            onChange={(e) => setToolkitBaseUrl(e.target.value)}
            placeholder="https://speakers.ejemplo.co"
          />
          <p className="text-xs text-muted-foreground">
            Dominio público del toolkit de este evento, sin barra final. GovTech
            usa https://speakers.govtechsummit.co. Vacío = este evento no
            muestra links de toolkit.
          </p>
        </div>
        <Button onClick={() => void handleGuardar()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-white p-6">
        <h2 className="text-sm font-semibold">Formulario Tally</h2>
        <p className="text-sm text-muted-foreground">
          Cada evento tiene su propio formulario y su propio webhook. Un envío
          crea o reutiliza la persona en el directorio global y la asocia a
          este evento. No pisa el toolkit ni las piezas de otro evento.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-tally-form">Id del formulario</Label>
          <Input
            id="ws-tally-form"
            className="w-full"
            value={tallyFormId}
            onChange={(e) => setTallyFormId(e.target.value)}
            placeholder="pbNMvy"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={tallyActivo}
            onCheckedChange={(v) => setTallyActivo(v === true)}
          />
          Formulario activo
        </label>
        {webhookTally ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">Webhook de este evento</p>
            <p className="break-all rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
              {webhookTally}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void copiarWebhook()}>
              Copiar URL
            </Button>
            <p className="text-xs text-muted-foreground">
              Pégala en Tally → Settings → Webhooks. El envío también se
              reconoce por el formId del payload si el token no viene en la
              URL (así sigue funcionando el webhook de GovTech ya configurado,
              formulario pbNMvy).
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Guarda el id para generar la URL del webhook.
          </p>
        )}
        <Button
          type="button"
          onClick={() => void guardarTally()}
          disabled={guardandoTally}
        >
          {guardandoTally ? 'Guardando…' : 'Guardar formulario'}
        </Button>
      </section>

      <section className="space-y-6 rounded-xl border border-border bg-white p-6">
        <h2 className="text-sm font-semibold">Configuración del evento</h2>
        <CatalogEditor
          title="Escenarios"
          addLabel="Agregar escenario"
          placeholder="Nombre del escenario"
          items={escenarios}
          onAdd={(n) => handleAdd('escenarios', n)}
          onRemove={(id) => handleRemove('escenarios', id)}
        />
        <CatalogEditor
          title="Formatos"
          addLabel="Agregar formato"
          placeholder="Nombre del formato"
          items={formatos}
          onAdd={(n) => handleAdd('formatos', n)}
          onRemove={(id) => handleRemove('formatos', id)}
        />
        <CatalogEditor
          title="Tracks"
          addLabel="Agregar track"
          placeholder="Nombre del track"
          items={tracks}
          onAdd={(n) => handleAdd('tracks', n)}
          onRemove={(id) => handleRemove('tracks', id)}
        />
        <EstadosEditor
          estados={estados}
          onAdd={handleAddEstado}
          onUpdateColor={handleUpdateColorEstado}
          onToggleCuenta={handleToggleCuenta}
          onRemove={handleRemoveEstado}
          onReorder={handleReorderEstados}
        />
      </section>

      <section className="space-y-3 rounded-xl border border-destructive p-6">
        <h2 className="text-sm font-semibold text-destructive">Zona de peligro</h2>
        <p className="text-sm text-muted-foreground">
          Eliminar el workspace borra la programación de este evento. El pool
          global de speakers se conserva.
        </p>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Eliminar workspace
        </Button>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {nombreEvento}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todas las sesiones, escenarios y
              configuración del evento. Los speakers del pool global NO se
              eliminan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={eliminando}
              onClick={(e) => {
                e.preventDefault()
                void confirmEliminar()
              }}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar workspace'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={estadoAEliminar !== null}
        onOpenChange={(open) => !open && setEstadoAEliminar(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el estado «{estadoAEliminar?.nombre}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {estadoAEliminar?.count} sesión
              {estadoAEliminar?.count === 1 ? '' : 'es'} de este evento{' '}
              {estadoAEliminar?.count === 1 ? 'usa' : 'usan'} este estado. Al
              eliminarlo del catálogo, esas sesiones conservarán el texto «
              {estadoAEliminar?.nombre}» pero ya no aparecerá como columna en
              el Kanban ni como opción en el formulario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrandoEstado}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={borrandoEstado}
              onClick={(e) => {
                e.preventDefault()
                void confirmEliminarEstado()
              }}
            >
              {borrandoEstado ? 'Eliminando…' : 'Eliminar de todas formas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
