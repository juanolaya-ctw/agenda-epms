import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  asignarSpeaker,
  buscarSpeakers,
  cambiarRolSpeaker,
  desasignarSpeaker,
  ROLES_SPEAKER,
  speakersDeSesion,
  type SesionSpeaker,
  type SpeakerLite,
} from '@/hooks/useSesionesData'

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function SpeakerIdentidad({ speaker }: { speaker: SpeakerLite }) {
  const detalle = [speaker.cargo, speaker.empresa].filter(Boolean).join(' · ')
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <Avatar size="sm">
        {speaker.fotoUrl && <AvatarImage src={speaker.fotoUrl} alt={speaker.nombre} />}
        <AvatarFallback>{iniciales(speaker.nombre)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{speaker.nombre}</p>
        {detalle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="block max-w-full truncate text-xs text-muted-foreground">
                  {detalle}
                </p>
              </TooltipTrigger>
              <TooltipContent>{detalle}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

type SpeakersAsignadosProps = {
  sesionId: string | null
  capacidad: number
  onChanged: () => void
}

export function SpeakersAsignados({
  sesionId,
  capacidad,
  onChanged,
}: SpeakersAsignadosProps) {
  const [asignados, setAsignados] = useState<SesionSpeaker[]>([])
  const [cargando, setCargando] = useState(false)
  const [busy, setBusy] = useState(false)

  const [termino, setTermino] = useState('')
  const [resultados, setResultados] = useState<SpeakerLite[]>([])
  const [buscando, setBuscando] = useState(false)
  const [foco, setFoco] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function recargar(id: string) {
    setCargando(true)
    const { data, error } = await speakersDeSesion(id)
    setCargando(false)
    if (error) {
      toast.error(`No se pudieron cargar los speakers: ${error}`)
      return
    }
    setAsignados(data)
  }

  useEffect(() => {
    if (!sesionId) {
      setAsignados([])
      return
    }
    void recargar(sesionId)
  }, [sesionId])

  useEffect(() => {
    if (!foco) {
      setResultados([])
      setBuscando(false)
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    const term = termino.trim()
    setBuscando(true)
    debounce.current = setTimeout(async () => {
      const { data, error } = await buscarSpeakers(term, term ? 8 : 5)
      setBuscando(false)
      if (error) {
        toast.error(`Error al buscar speakers: ${error}`)
        return
      }
      setResultados(data)
    }, term ? 250 : 0)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [termino, foco])

  const idsAsignados = useMemo(
    () => new Set(asignados.map((row) => row.id)),
    [asignados],
  )
  const disponibles = resultados.filter((row) => !idsAsignados.has(row.id))
  const completo = asignados.length >= capacidad

  async function handleAgregar(speaker: SpeakerLite) {
    if (!sesionId) return
    if (completo) {
      toast.error(
        `Capacidad completa: la sesión admite ${capacidad} speaker(s).`,
      )
      return
    }
    setBusy(true)
    const { error } = await asignarSpeaker(sesionId, speaker.id, 'panelista')
    setBusy(false)
    if (error) {
      toast.error(`No se pudo asignar: ${error}`)
      return
    }
    setTermino('')
    setResultados([])
    setFoco(false)
    await recargar(sesionId)
    onChanged()
  }

  async function handleRol(row: SesionSpeaker, rol: string) {
    setBusy(true)
    const { error } = await cambiarRolSpeaker(row.sesionSpeakerId, rol)
    setBusy(false)
    if (error) {
      toast.error(`No se pudo cambiar el rol: ${error}`)
      return
    }
    setAsignados((prev) =>
      prev.map((item) =>
        item.sesionSpeakerId === row.sesionSpeakerId ? { ...item, rol } : item,
      ),
    )
    onChanged()
  }

  async function handleQuitar(row: SesionSpeaker) {
    if (!sesionId) return
    setBusy(true)
    const { error } = await desasignarSpeaker(row.sesionSpeakerId)
    setBusy(false)
    if (error) {
      toast.error(`No se pudo desasignar: ${error}`)
      return
    }
    await recargar(sesionId)
    onChanged()
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <Label>Speakers asignados</Label>
        <span className="text-xs text-muted-foreground">
          {asignados.length} de {capacidad} spots ocupados
        </span>
      </div>

      {!sesionId ? (
        <p className="text-xs text-muted-foreground">
          Guarda la sesión primero para asignar speakers.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {cargando && (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            )}
            {!cargando && asignados.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin speakers asignados todavía.
              </p>
            )}
            {asignados.map((row) => (
              <div
                key={row.sesionSpeakerId}
                className="flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md border border-border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <SpeakerIdentidad speaker={row} />
                </div>
                <Select
                  value={row.rol}
                  onValueChange={(value) => handleRol(row, value)}
                  disabled={busy}
                >
                  <SelectTrigger className="h-7 w-32 shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES_SPEAKER.map((rol) => (
                      <SelectItem key={rol} value={rol}>
                        {rol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={`Quitar a ${row.nombre}`}
                  disabled={busy}
                  onClick={() => handleQuitar(row)}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <div className="relative">
            <Input
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              onFocus={() => setFoco(true)}
              onBlur={() => setTimeout(() => setFoco(false), 150)}
              placeholder="Agregar speaker…"
              disabled={completo || busy}
            />
            {completo && (
              <p className="mt-1 text-xs text-secondary">
                Capacidad completa.
              </p>
            )}
            {foco && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {buscando && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Buscando…
                  </p>
                )}
                {!buscando && disponibles.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {termino.trim() ? 'Sin coincidencias.' : 'No hay speakers.'}
                  </p>
                )}
                {disponibles.map((speaker) => (
                  <button
                    key={speaker.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      void handleAgregar(speaker)
                    }}
                  >
                    <SpeakerIdentidad speaker={speaker} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
