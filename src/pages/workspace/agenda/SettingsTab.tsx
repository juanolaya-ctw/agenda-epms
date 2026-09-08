import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

  useEffect(() => {
    if (!workspace) return
    setNombre(workspace.nombre)
    setFechaInicio(workspace.fechaInicio)
    setFechaFin(workspace.fechaFin)
  }, [workspace])

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

  const nombreEvento = workspace?.nombre || 'este workspace'

  return (
    <div className="mx-auto max-w-xl space-y-8">
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

      <section className="space-y-3 rounded-xl border border-destructive p-6">
        <h2 className="text-sm font-semibold text-destructive">Zona de peligro</h2>
        <p className="text-sm text-muted-foreground">
          Eliminar el workspace borra la programación de este evento. El pool
          global de speakers se conserva.
        </p>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
        >
          Eliminar workspace
        </Button>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {nombreEvento}?
            </AlertDialogTitle>
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
