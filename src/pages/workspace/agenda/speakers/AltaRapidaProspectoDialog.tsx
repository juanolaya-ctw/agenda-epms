import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { altaRapidaProspecto } from '@/hooks/useSpeakersData'
import type { AltaRapidaInput } from '@/lib/prospeccionAlta'

type AltaRapidaProspectoDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventoId: string
  onCreated: () => void
}

const EMPTY: AltaRapidaInput = {
  nombre: '',
  cargo: '',
  empresa: '',
  pais: '',
  contactoLibre: '',
  email: '',
}

export function AltaRapidaProspectoDialog({
  open,
  onOpenChange,
  eventoId,
  onCreated,
}: AltaRapidaProspectoDialogProps) {
  const [form, setForm] = useState<AltaRapidaInput>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setSaving(false)
    }
  }, [open])

  function set<K extends keyof AltaRapidaInput>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      const result = await altaRapidaProspecto(eventoId, form)
      if ('created' in result && result.created) {
        toast.success('Prospecto creado y asociado al evento')
      } else if ('associated' in result) {
        toast.success(
          result.createdMembership
            ? 'Speaker existente asociado al evento'
            : 'Speaker ya estaba en el evento; datos de prospección actualizados',
        )
      }
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(
        `No se pudo crear: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alta rápida de prospecto</DialogTitle>
          <DialogDescription>
            Crea o asocia un speaker a este evento en estado pendiente de
            contactar. El email es opcional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alta-nombre">Nombre *</Label>
            <Input
              id="alta-nombre"
              value={form.nombre ?? ''}
              onChange={(e) => set('nombre', e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alta-cargo">Cargo</Label>
              <Input
                id="alta-cargo"
                value={form.cargo ?? ''}
                onChange={(e) => set('cargo', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alta-empresa">Empresa</Label>
              <Input
                id="alta-empresa"
                value={form.empresa ?? ''}
                onChange={(e) => set('empresa', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alta-pais">País</Label>
              <Input
                id="alta-pais"
                value={form.pais ?? ''}
                onChange={(e) => set('pais', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alta-email">Email (opcional)</Label>
              <Input
                id="alta-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alta-contacto">Contacto libre</Label>
            <Input
              id="alta-contacto"
              value={form.contactoLibre ?? ''}
              onChange={(e) => set('contactoLibre', e.target.value)}
              placeholder="WhatsApp, LinkedIn, nota…"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              <UserPlus />
              {saving ? 'Guardando…' : 'Crear prospecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
