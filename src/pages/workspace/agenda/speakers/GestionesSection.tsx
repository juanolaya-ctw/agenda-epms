import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  listarGestionesEventoSpeaker,
  listarGestionesSpeakerGlobal,
  type Gestion,
  type GestionConEvento,
} from '@/hooks/useGestionesData'
import { listarUsuariosAgenda } from '@/hooks/useSpeakersData'
import type { EventoSpeakerEstado } from '@/lib/eventoSpeakerEstado'
import type { ResultadoRegistroGestion } from '@/lib/gestionForm'
import { GestionesList } from './GestionesList'
import { RegistrarGestionForm } from './RegistrarGestionForm'

type GestionesSectionProps = {
  modo: 'evento' | 'global'
  speakerId: string
  eventoId?: string
  estadoEnEvento?: EventoSpeakerEstado | null
  /** Formulario de alta (solo Agenda + editable). */
  puedeRegistrar: boolean
  onRegistered?: (resultado: ResultadoRegistroGestion) => void
}

export function GestionesSection({
  modo,
  speakerId,
  eventoId,
  estadoEnEvento = null,
  puedeRegistrar,
  onRegistered,
}: GestionesSectionProps) {
  const [gestiones, setGestiones] = useState<
    Array<Gestion | GestionConEvento>
  >([])
  const [nombresPorUsuario, setNombresPorUsuario] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, usuarios] = await Promise.all([
        modo === 'evento' && eventoId
          ? listarGestionesEventoSpeaker(eventoId, speakerId)
          : listarGestionesSpeakerGlobal(speakerId),
        listarUsuariosAgenda().catch(() => []),
      ])
      setGestiones(rows)
      const map: Record<string, string> = {}
      for (const u of usuarios) {
        if (u.nombre.trim()) map[u.id] = u.nombre.trim()
      }
      setNombresPorUsuario(map)
    } catch (err) {
      toast.error(
        `No se pudieron cargar gestiones: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      setGestiones([])
    } finally {
      setLoading(false)
    }
  }, [modo, eventoId, speakerId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        {modo === 'global'
          ? 'Gestiones en todos los eventos'
          : 'Gestiones'}
      </h3>
      {puedeRegistrar && modo === 'evento' && eventoId && (
        <RegistrarGestionForm
          eventoId={eventoId}
          speakerId={speakerId}
          estadoEnEvento={estadoEnEvento}
          onRegistered={(resultado) => {
            void cargar()
            onRegistered?.(resultado)
          }}
        />
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <GestionesList
          gestiones={gestiones}
          nombresPorUsuario={nombresPorUsuario}
          mostrarEvento={modo === 'global'}
        />
      )}
    </div>
  )
}
