import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReportarRequestDialog } from '@/components/requests/ReportarRequestDialog'
import {
  contrasteSobreHex,
  desplazarAgenda,
  normalizarColorEscenario,
  type EscenarioCatalogo,
  type SesionesData,
  type Sesion,
} from '@/hooks/useSesionesData'
import { diasDelEvento, formatDiaCorto, minutosDelDia } from './format'
import { SesionFormDialog } from './SesionFormDialog'
import { SpeakerPrimaryName } from './SpeakersAvatarStack'
import { filtrarSesionesVista, VistaFiltros } from './VistaFiltros'

const INICIO_MIN = 7 * 60 // 07:00
const FIN_MIN = 21 * 60 // 21:00
const PASO_MIN = 30
const ROW_H = 40 // px por intervalo de 30 min
const FILAS = (FIN_MIN - INICIO_MIN) / PASO_MIN
const ALTO_TOTAL = FILAS * ROW_H
const GAP_PX = 2

type LayoutBloque = {
  sesion: Sesion
  col: number
  cols: number
}

/**
 * Empaqueta sesiones solapadas en columnas (estilo Google Calendar).
 * Con filtro a un escenario, cada bloque ocupa el 100% de la celda.
 */
function layoutSesionesDia(sesiones: Sesion[]): LayoutBloque[] {
  const validas = sesiones.filter(
    (s) =>
      s.horaInicio &&
      s.horaFin &&
      minutosDelDia(s.horaFin) > minutosDelDia(s.horaInicio),
  )
  if (validas.length === 0) return []

  const sorted = [...validas].sort((a, b) => {
    const byStart = a.horaInicio.localeCompare(b.horaInicio)
    if (byStart !== 0) return byStart
    const byEnd = a.horaFin.localeCompare(b.horaFin)
    if (byEnd !== 0) return byEnd
    return a.id.localeCompare(b.id)
  })

  type Cluster = Sesion[]
  const clusters: Cluster[] = []
  let current: Cluster = []
  let clusterEnd = -1

  for (const sesion of sorted) {
    const ini = minutosDelDia(sesion.horaInicio)
    const fin = minutosDelDia(sesion.horaFin)
    if (current.length === 0 || ini < clusterEnd) {
      current.push(sesion)
      clusterEnd = Math.max(clusterEnd, fin)
    } else {
      clusters.push(current)
      current = [sesion]
      clusterEnd = fin
    }
  }
  if (current.length > 0) clusters.push(current)

  const result: LayoutBloque[] = []

  for (const cluster of clusters) {
    const colEnds: number[] = []
    const assigned: { sesion: Sesion; col: number }[] = []

    for (const sesion of cluster) {
      const ini = minutosDelDia(sesion.horaInicio)
      const fin = minutosDelDia(sesion.horaFin)
      let col = colEnds.findIndex((end) => end <= ini)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(fin)
      } else {
        colEnds[col] = fin
      }
      assigned.push({ sesion, col })
    }

    const cols = Math.max(1, colEnds.length)
    for (const item of assigned) {
      result.push({ sesion: item.sesion, col: item.col, cols })
    }
  }

  return result
}

function BloqueSesion({
  sesion,
  colorHex,
  col,
  cols,
  onClick,
}: {
  sesion: Sesion
  colorHex: string
  col: number
  cols: number
  onClick: () => void
}) {
  const ini = minutosDelDia(sesion.horaInicio)
  const fin = minutosDelDia(sesion.horaFin)
  if (!sesion.horaInicio || !sesion.horaFin || fin <= ini) return null

  const top = ((Math.max(ini, INICIO_MIN) - INICIO_MIN) / PASO_MIN) * ROW_H
  const alto = Math.max(
    18,
    ((Math.min(fin, FIN_MIN) - Math.max(ini, INICIO_MIN)) / PASO_MIN) * ROW_H,
  )
  const muestraHora = alto >= 36
  const muestraSpeaker = alto >= 54
  const textColor = contrasteSobreHex(colorHex)
  const leftPct = (col / cols) * 100
  const widthPct = 100 / cols

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        top,
        height: alto,
        left: `calc(${leftPct}% + ${GAP_PX}px)`,
        width: `calc(${widthPct}% - ${GAP_PX * 2}px)`,
        backgroundColor: colorHex,
        color: textColor,
      }}
      title={`${sesion.titulo} · ${sesion.horaInicio}–${sesion.horaFin} · ${sesion.speakersAsignados}/${sesion.capacidadSpeakers} speakers`}
    >
      <p className="truncate text-[12px] font-bold leading-tight">
        {sesion.titulo}
        {!muestraHora &&
          ` · ${sesion.speakersAsignados}/${sesion.capacidadSpeakers}`}
      </p>
      {muestraHora && (
        <p className="truncate opacity-80">
          {sesion.horaInicio}–{sesion.horaFin} · {sesion.speakersAsignados}/
          {sesion.capacidadSpeakers}
        </p>
      )}
      {muestraSpeaker && (
        <SpeakerPrimaryName
          speakers={sesion.speakers}
          className="mt-1"
        />
      )}
    </button>
  )
}

type SesionesCalendarioViewProps = {
  data: SesionesData
  eventoId: string
  eventoRango: { inicio: string; fin: string }
  /** CS / Sales: sin desplazar agenda ni editar sesión. */
  readOnly?: boolean
}

export function SesionesCalendarioView({
  data,
  eventoId,
  eventoRango,
  readOnly = false,
}: SesionesCalendarioViewProps) {
  const {
    sesiones,
    escenarios,
    tracks,
    formatos,
    estados,
    loading,
    error,
    refetch,
  } = data
  const [vista] = useState<'semana' | 'mes'>('semana')
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [sesionActiva, setSesionActiva] = useState<Sesion | null>(null)
  const [sugerirOpen, setSugerirOpen] = useState(false)
  const [minutos, setMinutos] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [filtroEscenarioId, setFiltroEscenarioId] = useState<string | null>(null)
  const [filtroDia, setFiltroDia] = useState<string | null>(null)

  const diasOpciones = useMemo(
    () =>
      diasDelEvento(
        eventoRango.inicio,
        eventoRango.fin,
        sesiones.map((s) => s.dia),
      ),
    [eventoRango.inicio, eventoRango.fin, sesiones],
  )

  const dias = useMemo(
    () =>
      filtroDia ? diasOpciones.filter((d) => d === filtroDia) : diasOpciones,
    [diasOpciones, filtroDia],
  )

  const sesionesVisibles = useMemo(
    () => filtrarSesionesVista(sesiones, filtroEscenarioId, filtroDia),
    [sesiones, filtroEscenarioId, filtroDia],
  )

  const colorPorEscenario = useMemo(() => {
    const map = new Map<string, string>()
    escenarios.forEach((esc, index) => {
      map.set(esc.id, normalizarColorEscenario(esc.color, index))
    })
    return map
  }, [escenarios])

  const escenariosLeyenda = useMemo((): EscenarioCatalogo[] => {
    if (!filtroEscenarioId) return escenarios
    return escenarios.filter((e) => e.id === filtroEscenarioId)
  }, [escenarios, filtroEscenarioId])

  const layoutPorDia = useMemo(() => {
    const map = new Map<string, LayoutBloque[]>()
    for (const dia of dias) {
      const delDia = sesionesVisibles.filter((s) => s.dia === dia)
      map.set(dia, layoutSesionesDia(delDia))
    }
    return map
  }, [dias, sesionesVisibles])

  const filas = Array.from({ length: FILAS }, (_, i) => INICIO_MIN + i * PASO_MIN)

  async function handleAplicar() {
    const valor = Number(minutos)
    if (!Number.isInteger(valor) || valor === 0) {
      toast.error('Ingresa un número entero de minutos distinto de cero.')
      return
    }
    setAplicando(true)
    const { error: shiftError } = await desplazarAgenda(eventoId, valor)
    setAplicando(false)
    if (shiftError) {
      toast.error(`No se pudo desplazar la agenda: ${shiftError}`)
      return
    }
    toast.success(
      `Agenda desplazada ${valor > 0 ? '+' : ''}${valor} min`,
    )
    setShiftDialogOpen(false)
    setMinutos('')
    refetch()
  }

  function openEdit(sesion: Sesion) {
    setSesionActiva(sesion)
    setEditDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="default"
            >
              Semana
            </Button>
          </div>
          <VistaFiltros
            escenarios={escenarios}
            dias={diasOpciones}
            escenarioId={filtroEscenarioId}
            dia={filtroDia}
            onEscenarioChange={setFiltroEscenarioId}
            onDiaChange={setFiltroDia}
          />
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShiftDialogOpen(true)}>
            Desplazar agenda
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {escenariosLeyenda.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {escenariosLeyenda.map((esc, index) => (
            <span key={esc.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block size-3 rounded-sm"
                style={{
                  backgroundColor: normalizarColorEscenario(esc.color, index),
                }}
              />
              {esc.nombre}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : vista === 'mes' ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Vista mes — próximamente
        </div>
      ) : dias.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Sin días de evento para mostrar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: `64px repeat(${dias.length}, minmax(120px, 1fr))`,
            }}
          >
            <div className="border-b border-border bg-muted/40" />
            {dias.map((dia) => (
              <div
                key={dia}
                className="border-b border-l border-border bg-muted/40 px-2 py-1.5 text-center text-xs font-medium"
              >
                {formatDiaCorto(dia)}
              </div>
            ))}

            <div className="relative" style={{ height: ALTO_TOTAL }}>
              {filas.map((min) => (
                <div
                  key={min}
                  className="border-t border-border/50 pr-1 text-right text-[10px] text-muted-foreground"
                  style={{ height: ROW_H }}
                >
                  {horaLabel(min)}
                </div>
              ))}
            </div>

            {dias.map((dia) => {
              const layout = layoutPorDia.get(dia) ?? []
              return (
                <div
                  key={dia}
                  className="relative border-l border-border"
                  style={{ height: ALTO_TOTAL }}
                >
                  {filas.map((min) => (
                    <div
                      key={min}
                      className="border-t border-border/50"
                      style={{ height: ROW_H }}
                    />
                  ))}
                  {layout.map(({ sesion, col, cols }) => (
                    <BloqueSesion
                      key={sesion.id}
                      sesion={sesion}
                      col={col}
                      cols={cols}
                      colorHex={
                        colorPorEscenario.get(sesion.escenarioId) ??
                        normalizarColorEscenario(null, 0)
                      }
                      onClick={() => openEdit(sesion)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!readOnly && (
        <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
          <DialogContent className="max-w-sm bg-background">
            <DialogHeader>
              <DialogTitle>Desplazar agenda</DialogTitle>
              <DialogDescription>
                Mueve todos los slots del evento. Positivo adelanta, negativo
                atrasa.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desplazar-minutos">Minutos</Label>
              <Input
                id="desplazar-minutos"
                type="number"
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                placeholder="Ej. 15 o -30"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShiftDialogOpen(false)}
                disabled={aplicando}
              >
                Cancelar
              </Button>
              <Button onClick={handleAplicar} disabled={aplicando}>
                {aplicando ? 'Aplicando…' : 'Aplicar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <SesionFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode={readOnly ? 'view' : 'edit'}
        sesion={sesionActiva}
        escenarios={escenarios}
        tracks={tracks}
        formatos={formatos}
        estados={estados}
        eventoRango={eventoRango}
        onSaved={refetch}
        onSugerirCambio={
          readOnly
            ? () => {
                setEditDialogOpen(false)
                setSugerirOpen(true)
              }
            : undefined
        }
      />

      {readOnly && (
        <ReportarRequestDialog
          open={sugerirOpen}
          onOpenChange={setSugerirOpen}
          title={`Sugerir cambio para ${sesionActiva?.titulo ?? 'sesión'}`}
          origen="sesion"
          sesionId={sesionActiva?.id}
          successToast="Sugerencia enviada al equipo de Agenda"
        />
      )}
    </div>
  )
}

function horaLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
