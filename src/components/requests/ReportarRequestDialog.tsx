import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  crearRequest,
  type RequestTipo,
} from '@/hooks/useRequestsData'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TIPOS_SPEAKER: { value: RequestTipo; label: string }[] = [
  { value: 'conflicto', label: 'Conflicto' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'propuesta_speaker', label: 'Propuesta speaker' },
]

const TIPOS_SESION: { value: RequestTipo; label: string }[] = [
  { value: 'conflicto', label: 'Conflicto' },
  { value: 'ajuste', label: 'Ajuste' },
]

type ReportarRequestDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título del dialog, p. ej. "Reportar sobre Ana Pérez" */
  title: string
  /** Variante de tipos según origen del reporte */
  origen: 'speaker' | 'sesion'
  speakerId?: string | null
  sesionId?: string | null
  /** Toast al éxito (default según origen) */
  successToast?: string
  onCreated?: () => void
}

export function ReportarRequestDialog({
  open,
  onOpenChange,
  title,
  origen,
  speakerId,
  sesionId,
  successToast,
  onCreated,
}: ReportarRequestDialogProps) {
  const { usuario } = useAuth()
  const tipos = origen === 'speaker' ? TIPOS_SPEAKER : TIPOS_SESION
  const [tipo, setTipo] = useState<RequestTipo>(tipos[0].value)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (open) {
      setTipo(tipos[0].value)
      setMotivo('')
      setEnviando(false)
    }
    // Reinicia solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, origen])

  async function handleEnviar() {
    const texto = motivo.trim()
    if (!texto) {
      toast.error('Describe qué quieres reportar.')
      return
    }
    if (!usuario) {
      toast.error('No hay sesión activa.')
      return
    }

    setEnviando(true)
    const { error } = await crearRequest({
      speaker_id: speakerId ?? null,
      sesion_id: sesionId ?? null,
      tipo,
      motivo: texto,
      solicitante_id: usuario.id,
      solicitante_area: 'CS',
      estado: 'PENDIENTE',
    })
    setEnviando(false)

    if (error) {
      toast.error(`No se pudo enviar: ${error}`)
      return
    }

    toast.success(
      successToast ??
        (origen === 'speaker'
          ? 'Reporte enviado al equipo de Agenda'
          : 'Sugerencia enviada al equipo de Agenda'),
    )
    onOpenChange(false)
    onCreated?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            El equipo de Agenda recibirá tu solicitud en su bandeja de requests.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-motivo">
              {origen === 'speaker' ? '¿Qué quieres reportar?' : 'Motivo / descripción'}
            </Label>
            <Textarea
              id="request-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                origen === 'speaker'
                  ? 'Describe el conflicto, ajuste o solicitud...'
                  : 'Describe el cambio que sugieres...'
              }
              rows={4}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as RequestTipo)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleEnviar()} disabled={enviando}>
            {enviando
              ? 'Enviando…'
              : origen === 'speaker'
                ? 'Enviar a Agenda'
                : 'Enviar sugerencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
