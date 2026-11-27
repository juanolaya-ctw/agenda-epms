import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cargarActividadSpeaker } from '@/hooks/useActividadData'
import {
  ACTIVIDAD_ORIGENES,
  ACTIVIDAD_ORIGEN_LABELS,
  type ActividadOrigen,
} from '@/lib/actividadLabels'
import {
  filtrarCambiosPorOrigen,
  filtrarPorAmbitoEvento,
  mergeActividadTimeline,
  type FiltroAmbitoActividad,
  type GestionTimelineInput,
  type SpeakerCambio,
} from '@/lib/actividadTimeline'
import { ActividadList } from './ActividadList'

type ActividadSectionProps = {
  modo: 'evento' | 'global'
  speakerId: string
  eventoId?: string
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground'
          : 'rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted'
      }
    >
      {label}
    </button>
  )
}

export function ActividadSection({
  modo,
  speakerId,
  eventoId,
}: ActividadSectionProps) {
  const [cambios, setCambios] = useState<SpeakerCambio[]>([])
  const [gestiones, setGestiones] = useState<GestionTimelineInput[]>([])
  const [nombresPorUsuario, setNombresPorUsuario] = useState<
    Record<string, string>
  >({})
  const [nombresEvento, setNombresEvento] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(false)
  const [ambito, setAmbito] = useState<FiltroAmbitoActividad>(() =>
    modo === 'global' ? 'todos' : 'este_evento',
  )
  const [origenes, setOrigenes] = useState<Set<ActividadOrigen>>(() => new Set())

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await cargarActividadSpeaker({
        speakerId,
        modo,
        eventoId,
      })
      setCambios(data.cambios)
      setGestiones(data.gestiones)
      setNombresPorUsuario(data.nombresPorUsuario)
      setNombresEvento(data.nombresEvento)
    } catch (err) {
      toast.error(
        `No se pudo cargar la actividad: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      setCambios([])
      setGestiones([])
    } finally {
      setLoading(false)
    }
  }, [speakerId, modo, eventoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    setAmbito(modo === 'global' ? 'todos' : 'este_evento')
  }, [modo, speakerId])

  const items = useMemo(() => {
    const filtrado = filtrarPorAmbitoEvento(
      filtrarCambiosPorOrigen(cambios, origenes),
      gestiones,
      ambito,
      eventoId ?? null,
    )
    // Gestiones no se filtran por origen (no tienen origen de cambio).
    return mergeActividadTimeline(
      filtrado.cambios,
      filtrado.gestiones,
      nombresEvento,
    )
  }, [cambios, gestiones, ambito, eventoId, origenes, nombresEvento])

  function toggleOrigen(o: ActividadOrigen) {
    setOrigenes((prev) => {
      const next = new Set(prev)
      if (next.has(o)) next.delete(o)
      else next.add(o)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Actividad</h3>

      {modo === 'evento' && eventoId && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            active={ambito === 'este_evento'}
            label="Este evento"
            onClick={() => setAmbito('este_evento')}
          />
          <Chip
            active={ambito === 'todos'}
            label="Todos los eventos"
            onClick={() => setAmbito('todos')}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {ACTIVIDAD_ORIGENES.map((o) => (
          <Chip
            key={o}
            active={origenes.has(o)}
            label={ACTIVIDAD_ORIGEN_LABELS[o]}
            onClick={() => toggleOrigen(o)}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <ActividadList
          items={items}
          nombresPorUsuario={nombresPorUsuario}
          mostrarEvento={ambito === 'todos' || modo === 'global'}
        />
      )}
    </div>
  )
}
