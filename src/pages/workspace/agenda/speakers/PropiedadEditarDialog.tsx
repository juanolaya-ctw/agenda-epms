import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  eliminarPropiedad,
  renombrarPropiedad,
  type PropiedadCustom,
} from '@/hooks/useSpeakersData'

type PropiedadEditarDialogProps = {
  propiedad: PropiedadCustom | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function PropiedadEditarDialog({
  propiedad,
  onOpenChange,
  onSaved,
}: PropiedadEditarDialogProps) {
  const [nombre, setNombre] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  useEffect(() => {
    if (propiedad) {
      setNombre(propiedad.nombre)
      setConfirmarBorrar(false)
      setBusy(false)
    }
  }, [propiedad])

  async function handleRenombrar() {
    if (!propiedad) return
    if (!nombre.trim()) {
      toast.error('El nombre no puede estar vacío.')
      return
    }
    setBusy(true)
    try {
      await renombrarPropiedad(propiedad.id, nombre.trim())
      toast.success('Propiedad renombrada')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        `No se pudo renombrar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleEliminar() {
    if (!propiedad) return
    if (!confirmarBorrar) {
      setConfirmarBorrar(true)
      return
    }
    setBusy(true)
    try {
      await eliminarPropiedad(propiedad.id)
      toast.success('Propiedad eliminada')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={propiedad !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-background">
        <DialogHeader>
          <DialogTitle>Editar propiedad</DialogTitle>
          <DialogDescription>
            Aplica a todos los speakers de este evento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="prop-editar-nombre">Nombre</Label>
          <Input
            id="prop-editar-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="destructive"
            onClick={handleEliminar}
            disabled={busy}
          >
            {confirmarBorrar ? 'Confirmar eliminación' : 'Eliminar'}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button onClick={handleRenombrar} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
