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
import {
  eliminarSpeaker,
  sesionesDeSpeaker,
  type ParticipacionSesion,
  type Speaker,
} from '@/hooks/useSpeakersData'

type EliminarSpeakerDialogProps = {
  /** null = cerrado */
  speaker: Speaker | null
  /** evento para listar las sesiones en las que participa (el CASCADE borra
   *  de todas formas; esto es solo el preview de la confirmación) */
  eventoId: string
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function EliminarSpeakerDialog({
  speaker,
  eventoId,
  onOpenChange,
  onDeleted,
}: EliminarSpeakerDialogProps) {
  const [participaciones, setParticipaciones] = useState<ParticipacionSesion[]>(
    [],
  )
  const [cargando, setCargando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const speakerId = speaker?.id ?? null

  useEffect(() => {
    if (!speakerId) return
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
  }, [speakerId, eventoId])

  async function confirmar() {
    if (!speaker) return
    setEliminando(true)
    try {
      await eliminarSpeaker(speaker.id)
      toast.success('Speaker eliminado')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setEliminando(false)
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
          <AlertDialogTitle>¿Eliminar a {nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            {cargando
              ? 'Verificando sesiones asignadas…'
              : tieneSesiones
                ? 'Al eliminarlo, también se removerá de estas sesiones. Esta acción no se puede deshacer.'
                : 'Esta acción no se puede deshacer.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {tieneSesiones && (
          <div className="text-sm">
            <p className="mb-1 font-medium">Este speaker participa en:</p>
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

        <AlertDialogFooter>
          <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={eliminando || cargando}
            onClick={(e) => {
              e.preventDefault()
              void confirmar()
            }}
          >
            {eliminando
              ? 'Eliminando…'
              : tieneSesiones
                ? 'Eliminar de todas formas'
                : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
