import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'
import type { ResultadoRegistroGestion } from '@/lib/gestionForm'
import { RegistrarGestionForm } from './RegistrarGestionForm'

type RegistrarGestionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventoId: string
  speakerId: string
  speakerNombre: string
  estadoEnEvento: EventoSpeakerEstado | null
  onRegistered: (resultado?: ResultadoRegistroGestion) => void
}

export function RegistrarGestionDialog({
  open,
  onOpenChange,
  eventoId,
  speakerId,
  speakerNombre,
  estadoEnEvento,
  onRegistered,
}: RegistrarGestionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar gestión</DialogTitle>
          <DialogDescription>
            Bitácora de contacto con «{speakerNombre}» en este evento.
          </DialogDescription>
        </DialogHeader>
        <RegistrarGestionForm
          eventoId={eventoId}
          speakerId={speakerId}
          estadoEnEvento={estadoEnEvento}
          compact
          onRegistered={(resultado) => {
            onRegistered(resultado)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
