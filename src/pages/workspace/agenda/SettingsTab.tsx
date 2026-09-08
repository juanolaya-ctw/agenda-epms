import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type CatalogItem = { id: string; nombre: string }

type CatalogTable = 'escenarios' | 'formatos' | 'tracks'

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

export function SettingsTab() {
  const { id: eventoId } = useParams()
  const navigate = useNavigate()
  const { workspace, updateWorkspace, removeWorkspace } = useWorkspace()

  const [nombre, setNombre] = useState(workspace?.nombre ?? '')
  const [fechaInicio, setFechaInicio] = useState(workspace?.fechaInicio ?? '')
  const [fechaFin, setFechaFin] = useState(workspace?.fechaFin ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const [escenarios, setEscenarios] = useState<CatalogItem[]>([])
  const [formatos, setFormatos] = useState<CatalogItem[]>([])
  const [tracks, setTracks] = useState<CatalogItem[]>([])

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
      const [esc, fmt, trk] = await Promise.all([
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
      ])
      if (cancelled) return
      if (esc.error) toast.error(`Escenarios: ${esc.error.message}`)
      if (fmt.error) toast.error(`Formatos: ${fmt.error.message}`)
      if (trk.error) toast.error(`Tracks: ${trk.error.message}`)
      setEscenarios((esc.data as CatalogItem[] | null) ?? [])
      setFormatos((fmt.data as CatalogItem[] | null) ?? [])
      setTracks((trk.data as CatalogItem[] | null) ?? [])
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
    setSaving(true)
    try {
      const { error } = await supabase
        .from('eventos')
        .update({
          nombre: nextNombre,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
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
    const { data, error } = await supabase
      .from(table)
      .insert({ evento_id: eventoId, nombre: nombreItem })
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

  const nombreEvento = workspace?.nombre || 'este workspace'

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Configuración del workspace</h1>

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
        <Button onClick={() => void handleGuardar()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
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
    </div>
  )
}
