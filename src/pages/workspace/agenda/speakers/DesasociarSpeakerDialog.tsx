import { useState } from 'react'
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
import {
  desasociarSpeakerDeEvento,
  type Speaker,
} from '@/hooks/useSpeakersData'

type DesasociarSpeakerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  speaker: Speaker | null
  eventoId: string
  onDone: () => void
}

/**
 * Quita del evento. Conserva seguimiento (props) e interacciones.
 * No elimina el perfil global. Bloquea si hay sesiones asignadas.
 */
export const DesasociarSpeakerDialog = ({
  open,
  onOpenChange,
  speaker,
  eventoId,
  onDone,
}: DesasociarSpeakerDialogProps) => {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    if (!speaker) return
    setBusy(true)
    try {
      const result = await desasociarSpeakerDeEvento(eventoId, speaker.id)
      if (!result.ok) {
        toast.error(
          `No se puede quitar: tiene ${result.sesiones} sesión(es) asignada(s). Desasigna las sesiones primero. El seguimiento se conserva.`,
        )
        return
      }
      toast.success(
        `«${speaker.nombre}» quitado del evento. Seguimiento e interacciones conservados; perfil global intacto.`,
      )
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast.error(
        `No se pudo desasociar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Quitar del evento</DialogTitle>
          <DialogDescription>
            Se elimina solo la membresía de «{speaker?.nombre ?? '…'}» en este
            evento. No borra el perfil del CRM global ni el seguimiento
            (propiedades / interacciones). Si tiene sesiones asignadas, la
            acción se bloquea.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !speaker}
            onClick={() => void handleConfirm()}
          >
            {busy ? 'Quitando…' : 'Quitar del evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
