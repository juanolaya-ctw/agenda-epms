import { useEffect, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  asociarSpeakerAEvento,
  buscarSpeakersGlobales,
  type SpeakerBusqueda,
} from '@/hooks/useSpeakersData'
import { ESTADO_ALTA_NUEVA } from '@/lib/eventoSpeakerEstado'
import { iniciales } from './speakerUtils'

type AsociarSpeakerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventoId: string
  onAsociado: () => void
  onCrearNuevo: () => void
}

export function AsociarSpeakerDialog({
  open,
  onOpenChange,
  eventoId,
  onAsociado,
  onCrearNuevo,
}: AsociarSpeakerDialogProps) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<SpeakerBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const [asociandoId, setAsociandoId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResultados([])
      setBuscando(false)
      setAsociandoId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResultados([])
      setBuscando(false)
      return
    }

    let cancelled = false
    setBuscando(true)
    const timer = window.setTimeout(() => {
      void buscarSpeakersGlobales(q, { eventoId })
        .then((rows) => {
          if (!cancelled) setResultados(rows)
        })
        .catch((err) => {
          if (!cancelled) {
            toast.error(
              `No se pudo buscar: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
            setResultados([])
          }
        })
        .finally(() => {
          if (!cancelled) setBuscando(false)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, eventoId])

  async function handleAsociar(speaker: SpeakerBusqueda) {
    if (speaker.yaAsociadoAlEvento) return
    setAsociandoId(speaker.id)
    try {
      const { created } = await asociarSpeakerAEvento(
        eventoId,
        speaker.id,
        ESTADO_ALTA_NUEVA,
      )
      if (created) {
        toast.success(
          `«${speaker.nombre}» asociado (${ESTADO_ALTA_NUEVA.replaceAll('_', ' ').toLowerCase()})`,
        )
      } else toast.message(`«${speaker.nombre}» ya estaba asociado`)
      onOpenChange(false)
      onAsociado()
    } catch (err) {
      toast.error(
        `No se pudo asociar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setAsociandoId(null)
    }
  }

  function handleCrearNuevo() {
    onOpenChange(false)
    onCrearNuevo()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Asociar speaker</DialogTitle>
          <DialogDescription>
            Busca en el directorio global (nombre, email u organización). Las
            coincidencias similares son alertas; no se fusionan perfiles. Puedes
            crear sin correo.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, email u organización…"
            className="pl-9"
            aria-label="Buscar speakers en el directorio"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {query.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Escribe al menos 2 caracteres para buscar.
            </p>
          ) : buscando ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Buscando…
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Sin resultados en el directorio.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {resultados.map((sp) => (
                <li
                  key={sp.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Avatar size="sm">
                    {sp.foto_url && (
                      <AvatarImage src={sp.foto_url} alt={sp.nombre} />
                    )}
                    <AvatarFallback>
                      {iniciales(sp.nombre || 'NN')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{sp.nombre}</p>
                      {sp.yaAsociadoAlEvento && (
                        <Badge variant="secondary" className="text-[10px]">
                          Ya en este evento
                        </Badge>
                      )}
                      {!sp.yaAsociadoAlEvento && sp.alertaSimilarNombre && (
                        <Badge variant="outline" className="text-[10px]">
                          Revisar coincidencia
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[sp.cargo, sp.empresa, sp.email || 'sin email']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      sp.yaAsociadoAlEvento || asociandoId === sp.id
                    }
                    onClick={() => void handleAsociar(sp)}
                    aria-label={
                      sp.yaAsociadoAlEvento
                        ? `${sp.nombre} ya asociado`
                        : `Asociar ${sp.nombre}`
                    }
                  >
                    {sp.yaAsociadoAlEvento
                      ? 'Asociado'
                      : asociandoId === sp.id
                        ? 'Asociando…'
                        : 'Asociar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleCrearNuevo}>
            <UserPlus />
            Crear speaker nuevo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
