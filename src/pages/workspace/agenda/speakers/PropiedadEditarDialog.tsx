import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  actualizarPropiedad,
  contarValoresPropiedad,
  eliminarPropiedad,
  type PropiedadCustom,
} from '@/hooks/useSpeakersData'

const TIPOS = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'texto', label: 'Texto' },
  { value: 'select', label: 'Select' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'checkbox', label: 'Checkbox' },
] as const

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
  const [tipo, setTipo] = useState<string>('texto')
  const [busy, setBusy] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [confirmTipo, setConfirmTipo] = useState(false)

  useEffect(() => {
    if (propiedad) {
      setNombre(propiedad.nombre)
      setTipo(propiedad.tipo)
      setConfirmarBorrar(false)
      setConfirmTipo(false)
      setBusy(false)
    }
  }, [propiedad])

  async function aplicarCambios() {
    if (!propiedad) return
    setBusy(true)
    try {
      await actualizarPropiedad(propiedad.id, {
        nombre: nombre.trim(),
        tipo,
      })
      toast.success('Propiedad actualizada')
      setConfirmTipo(false)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleGuardar() {
    if (!propiedad) return
    if (!nombre.trim()) {
      toast.error('El nombre no puede estar vacío.')
      return
    }

    const tipoCambio = tipo !== propiedad.tipo
    if (tipoCambio) {
      setBusy(true)
      try {
        const valores = await contarValoresPropiedad(propiedad.id)
        setBusy(false)
        if (valores > 0) {
          setConfirmTipo(true)
          return
        }
      } catch (err) {
        setBusy(false)
        toast.error(
          `No se pudo verificar: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return
      }
    }

    await aplicarCambios()
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

        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Button onClick={handleGuardar} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog
        open={confirmTipo}
        onOpenChange={(open) => !open && setConfirmTipo(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar el tipo de esta propiedad</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiar el tipo de esta propiedad puede hacer que los valores
              guardados no se vean correctamente. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void aplicarCambios()
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
