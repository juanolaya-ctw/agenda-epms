import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  eliminarSpeaker,
  quitarSpeakerDeEvento,
  sesionesDeSpeaker,
  type ParticipacionSesion,
  type Speaker,
} from '@/hooks/useSpeakersData'

type EliminarSpeakerDialogProps = {
  /** null = cerrado */
  speaker: Speaker | null
  /** evento para listar sesiones / soft-scope (workspace) */
  eventoId: string
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
  /**
   * workspace: acción primaria = quitar del evento; global solo con checkbox.
   * crm: solo borrado global, con checkbox de confirmación explícita.
   */
  modo?: 'workspace' | 'crm'
}

export function EliminarSpeakerDialog({
  speaker,
  eventoId,
  onOpenChange,
  onDeleted,
  modo = 'workspace',
}: EliminarSpeakerDialogProps) {
  const [participaciones, setParticipaciones] = useState<ParticipacionSesion[]>(
    [],
  )
  const [cargando, setCargando] = useState(false)
  const [accion, setAccion] = useState<'quitar' | 'global' | null>(null)
  const [confirmarGlobal, setConfirmarGlobal] = useState(false)

  const speakerId = speaker?.id ?? null
  const esCrm = modo === 'crm'
  const busy = accion !== null

  useEffect(() => {
    if (!speakerId) return
    setConfirmarGlobal(false)
    setAccion(null)
    if (esCrm || !eventoId) {
      setParticipaciones([])
      setCargando(false)
      return
    }
    let cancelled = false
    setCargando(true)
    setParticipaciones([])
    void sesionesDeSpeaker(speakerId, eventoId).then((res) => {
      if (cancelled) return
      if (res.error) {
        toast.error(`No se pudieron cargar las sesiones: ${res.error}`)
      }
      setParticipaciones(res.data)
      setCargando(false)
    })
    return () => {
      cancelled = true
    }
  }, [speakerId, eventoId, esCrm])

  const handleQuitarDeEvento = async () => {
    if (!speaker || !eventoId) return
    setAccion('quitar')
    try {
      await quitarSpeakerDeEvento(eventoId, speaker.id)
      toast.success(
        `«${speaker.nombre}» quitado de este evento. Perfil global intacto.`,
      )
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(
        `No se pudo quitar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setAccion(null)
    }
  }

  const handleEliminarGlobal = async () => {
    if (!speaker || !confirmarGlobal) return
    setAccion('global')
    try {
      await eliminarSpeaker(speaker.id)
      toast.success('Speaker eliminado del CRM global')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setAccion(null)
    }
  }

  const tieneSesiones = participaciones.length > 0
  const nombre = speaker?.nombre || 'este speaker'

  return (
    <AlertDialog
      open={speaker !== null}
      onOpenChange={(open) => !open && onOpenChange(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {esCrm
              ? `¿Eliminar a ${nombre} del CRM?`
              : `¿Quitar a ${nombre} de este evento?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {esCrm
              ? 'Se eliminará el perfil de todos los eventos, sesiones y el CRM. Esta acción no se puede deshacer.'
              : cargando
                ? 'Verificando sesiones asignadas…'
                : tieneSesiones
                  ? 'Se removerá de las sesiones de este evento y de la membresía. El perfil global y otros eventos no se tocan.'
                  : 'Se quita solo de este evento. El perfil del CRM global permanece.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!esCrm && tieneSesiones && (
          <div className="text-sm">
            <p className="mb-1 font-medium">Participa en este evento:</p>
            <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
              {participaciones.map((p) => (
                <li key={p.sesionId}>
                  {p.titulo || 'Sin título'}
                  {p.rol ? ` — ${p.rol}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-border p-3">
          <Checkbox
            id="confirmar-eliminar-global"
            checked={confirmarGlobal}
            disabled={busy}
            onCheckedChange={(value) => setConfirmarGlobal(value === true)}
            aria-label="Entiendo que se elimina de todos los eventos"
          />
          <Label
            htmlFor="confirmar-eliminar-global"
            className="text-sm font-normal leading-snug text-muted-foreground"
          >
            Entiendo que se elimina de todos los eventos
          </Label>
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>

          {!esCrm && (
            <AlertDialogAction
              disabled={busy || cargando}
              onClick={(e) => {
                e.preventDefault()
                void handleQuitarDeEvento()
              }}
            >
              {accion === 'quitar' ? 'Quitando…' : 'Quitar de este evento'}
            </AlertDialogAction>
          )}

          <AlertDialogAction
            variant="destructive"
            disabled={busy || cargando || !confirmarGlobal}
            onClick={(e) => {
              e.preventDefault()
              void handleEliminarGlobal()
            }}
          >
            {accion === 'global'
              ? 'Eliminando…'
              : 'Eliminar del CRM global'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
