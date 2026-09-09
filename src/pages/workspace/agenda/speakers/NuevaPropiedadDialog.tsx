import { useState } from 'react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { crearPropiedad } from '@/hooks/useSpeakersData'

const TIPOS = [
  { value: 'checklist', label: 'Checklist' },
  { value: 'texto', label: 'Texto' },
  { value: 'select', label: 'Select' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'checkbox', label: 'Checkbox' },
] as const

type NuevaPropiedadDialogProps = {
  eventoId: string
  onCreada: () => void
}

export function NuevaPropiedadDialog({
  eventoId,
  onCreada,
}: NuevaPropiedadDialogProps) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<string>('checklist')
  const [creando, setCreando] = useState(false)

  async function handleCrear() {
    if (!nombre.trim()) {
      toast.error('Escribe un nombre para la propiedad.')
      return
    }
    setCreando(true)
    try {
      await crearPropiedad(eventoId, nombre.trim(), tipo)
      toast.success('Propiedad creada')
      setNombre('')
      setTipo('checklist')
      setOpen(false)
      onCreada()
    } catch (err) {
      toast.error(
        `No se pudo crear: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setCreando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">+ Nueva propiedad</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader>
          <DialogTitle>Nueva propiedad de seguimiento</DialogTitle>
          <DialogDescription>
            Aplica a todos los speakers de este evento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-nombre">Nombre de la propiedad</Label>
          <Input
            id="np-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Checklist de piezas"
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

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={creando}
          >
            Cancelar
          </Button>
          <Button onClick={handleCrear} disabled={creando}>
            {creando ? 'Creando…' : 'Crear propiedad'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
