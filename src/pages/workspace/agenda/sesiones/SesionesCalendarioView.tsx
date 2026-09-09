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
import { cn } from '@/lib/utils'
import {
  desplazarAgenda,
  type SesionesData,
  type Sesion,
} from '@/hooks/useSesionesData'
import { diasEntre, formatDiaCorto, minutosDelDia } from './format'

const INICIO_MIN = 7 * 60 // 07:00
const FIN_MIN = 21 * 60 // 21:00
const PASO_MIN = 30
const ROW_H = 40 // px por intervalo de 30 min
const FILAS = (FIN_MIN - INICIO_MIN) / PASO_MIN
const ALTO_TOTAL = FILAS * ROW_H

const COLORES_ESCENARIO = [
  'bg-secondary text-secondary-foreground',
  'bg-secondary/60 text-secondary-foreground',
  'bg-muted text-foreground border border-border',
  'bg-secondary/30 text-foreground',
  'bg-muted/60 text-foreground border border-border',
]

function colorEscenario(index: number): string {
  return COLORES_ESCENARIO[index % COLORES_ESCENARIO.length]
}

function horaLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function BloqueSesion({
  sesion,
  color,
}: {
  sesion: Sesion
  color: string
}) {
  const ini = minutosDelDia(sesion.horaInicio)
  const fin = minutosDelDia(sesion.horaFin)
  if (!sesion.horaInicio || !sesion.horaFin || fin <= ini) return null

  const top = ((Math.max(ini, INICIO_MIN) - INICIO_MIN) / PASO_MIN) * ROW_H
  const alto = Math.max(
    18,
    ((Math.min(fin, FIN_MIN) - Math.max(ini, INICIO_MIN)) / PASO_MIN) * ROW_H,
  )

  return (
    <div
      className={cn(
        'absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight',
        color,
      )}
      style={{ top, height: alto }}
      title={`${sesion.titulo} · ${sesion.horaInicio}–${sesion.horaFin}`}
    >
      <p className="truncate font-medium">{sesion.titulo}</p>
      <p className="truncate opacity-80">
        {sesion.horaInicio}–{sesion.horaFin}
      </p>
    </div>
  )
}

type SesionesCalendarioViewProps = {
  data: SesionesData
  eventoId: string
  eventoRango: { inicio: string; fin: string }
}

export function SesionesCalendarioView({
  data,
  eventoId,
  eventoRango,
}: SesionesCalendarioViewProps) {
  const { sesiones, escenarios, loading, error, refetch } = data
  const [vista, setVista] = useState<'semana' | 'mes'>('semana')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [minutos, setMinutos] = useState('')
  const [aplicando, setAplicando] = useState(false)

  const dias = useMemo(() => {
    const rango = diasEntre(eventoRango.inicio, eventoRango.fin)
    if (rango.length > 0) return rango
    return [...new Set(sesiones.map((s) => s.dia).filter(Boolean))].sort()
  }, [eventoRango.inicio, eventoRango.fin, sesiones])

  const colorPorEscenario = useMemo(() => {
    const map = new Map<string, string>()
    escenarios.forEach((esc, index) => map.set(esc.id, colorEscenario(index)))
    return map
  }, [escenarios])

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
    setDialogOpen(false)
    setMinutos('')
    refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={vista === 'semana' ? 'default' : 'outline'}
            onClick={() => setVista('semana')}
          >
            Semana
          </Button>
          <Button
            size="sm"
            variant={vista === 'mes' ? 'default' : 'outline'}
            onClick={() => setVista('mes')}
          >
            Mes
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          Desplazar agenda
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {escenarios.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {escenarios.map((esc) => (
            <span key={esc.id} className="flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  'inline-block size-3 rounded-sm',
                  colorPorEscenario.get(esc.id),
                )}
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
              const delDia = sesiones.filter((s) => s.dia === dia)
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
                  {delDia.map((sesion) => (
                    <BloqueSesion
                      key={sesion.id}
                      sesion={sesion}
                      color={
                        colorPorEscenario.get(sesion.escenarioId) ??
                        'bg-muted text-foreground border border-border'
                      }
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              onClick={() => setDialogOpen(false)}
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
    </div>
  )
}
