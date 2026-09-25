import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  actualizarColorEscenario,
  actualizarSesion,
  CAPACIDAD_SPEAKERS_MAX,
  COLORES_ESCENARIO,
  crearSesion,
  IDIOMAS_SESION,
  normalizarColorEscenario,
  type EscenarioCatalogo,
  type EstadoSesion,
  type OpcionCatalogo,
  type Sesion,
  type SesionFormValues,
} from '@/hooks/useSesionesData'
import { cn } from '@/lib/utils'
import { SpeakersAsignados } from './SpeakersAsignados'
import { estadoDotClass } from './badges'

const SIN_TRACK = '__sin_track__'

type SesionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit' | 'view'
  sesion: Sesion | null
  escenarios: EscenarioCatalogo[]
  tracks: OpcionCatalogo[]
  formatos: OpcionCatalogo[]
  estados: EstadoSesion[]
  eventoRango: { inicio: string; fin: string }
  onSaved: () => void
  /** CS: muestra botón para sugerir cambio a Agenda. */
  onSugerirCambio?: () => void
}

type FormState = {
  titulo: string
  descripcion: string
  formato: string
  track: string
  idioma: string
  escenarioId: string
  dia: string
  horaInicio: string
  horaFin: string
  capacidadSpeakers: string
  estado: string
}

function initialState(
  sesion: Sesion | null,
  rangoInicio: string,
  defaultEstado: string,
): FormState {
  return {
    titulo: sesion?.titulo ?? '',
    descripcion: sesion?.descripcion ?? '',
    formato: sesion?.formato ?? '',
    track: sesion?.track ?? SIN_TRACK,
    idioma: sesion?.idioma ?? 'Español',
    escenarioId: sesion?.escenarioId ?? '',
    dia: sesion?.dia || rangoInicio,
    horaInicio: sesion?.horaInicio ?? '',
    horaFin: sesion?.horaFin ?? '',
    capacidadSpeakers: String(sesion?.capacidadSpeakers ?? 1),
    estado: sesion?.estado ?? defaultEstado,
  }
}

function validate(form: FormState): string | null {
  if (!form.titulo.trim()) return 'El título es obligatorio.'
  if (!form.formato) return 'Selecciona un formato.'
  if (!form.escenarioId) return 'Selecciona un escenario.'
  if (!form.dia) return 'Selecciona un día.'
  if (!form.horaInicio || !form.horaFin) return 'Indica hora de inicio y fin.'
  if (form.horaFin <= form.horaInicio)
    return 'La hora de fin debe ser posterior a la de inicio.'
  const capacidad = Number(form.capacidadSpeakers)
  if (
    !Number.isInteger(capacidad) ||
    capacidad < 1 ||
    capacidad > CAPACIDAD_SPEAKERS_MAX
  )
    return `La capacidad de speakers debe ser un entero entre 1 y ${CAPACIDAD_SPEAKERS_MAX}.`
  return null
}

function dash(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return v || '—'
}

function CampoVista({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function SesionFormDialog({
  open,
  onOpenChange,
  mode,
  sesion,
  escenarios,
  tracks,
  formatos,
  estados,
  eventoRango,
  onSaved,
  onSugerirCambio,
}: SesionFormDialogProps) {
  const defaultEstado = estados[0]?.nombre ?? 'BORRADOR'
  const [form, setForm] = useState<FormState>(() =>
    initialState(sesion, eventoRango.inicio, defaultEstado),
  )
  const [saving, setSaving] = useState(false)
  const [savingColor, setSavingColor] = useState(false)
  const isView = mode === 'view'

  useEffect(() => {
    if (open) {
      setForm(initialState(sesion, eventoRango.inicio, defaultEstado))
      setSaving(false)
      setSavingColor(false)
    }
    // Reinicia solo al abrir o al cambiar de sesión, no en cada refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sesion?.id, eventoRango.inicio, defaultEstado])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const capacidadNum = Math.max(1, Number(form.capacidadSpeakers) || 1)

  const escenarioIndex = escenarios.findIndex((e) => e.id === form.escenarioId)
  const escenarioActivo =
    escenarioIndex >= 0 ? escenarios[escenarioIndex] : null
  const colorEscenarioActivo = escenarioActivo
    ? normalizarColorEscenario(
        escenarioActivo.color,
        Math.max(0, escenarioIndex),
      )
    : null

  const escenarioNombre =
    escenarioActivo?.nombre ?? sesion?.escenarioNombre ?? ''
  const trackLabel =
    form.track === SIN_TRACK || !form.track ? 'Sin track' : form.track

  async function handleColorEscenario(color: string) {
    if (!form.escenarioId || isView) return
    if (color === colorEscenarioActivo) return
    setSavingColor(true)
    const { error } = await actualizarColorEscenario(form.escenarioId, color)
    setSavingColor(false)
    if (error) {
      toast.error(`No se pudo cambiar el color: ${error}`)
      return
    }
    toast.success('Color del escenario actualizado')
    onSaved()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isView) return
    const problem = validate(form)
    if (problem) {
      toast.error(problem)
      return
    }

    const values: SesionFormValues = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion,
      formato: form.formato,
      track: form.track === SIN_TRACK ? null : form.track,
      idioma: form.idioma,
      escenarioId: form.escenarioId,
      dia: form.dia,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      capacidadSpeakers: Number(form.capacidadSpeakers),
      estado: form.estado,
    }

    setSaving(true)
    const { error } =
      mode === 'edit' && sesion
        ? await actualizarSesion(sesion.id, sesion.slotId, values)
        : await crearSesion(values)
    setSaving(false)

    if (error) {
      toast.error(`No se pudo guardar: ${error}`)
      return
    }

    toast.success(mode === 'edit' ? 'Sesión actualizada' : 'Sesión creada')
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[832px] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] max-h-[880px] overflow-x-hidden overflow-y-auto bg-white p-0">
        <div className="min-w-0 p-6">
          <DialogHeader>
            <DialogTitle>
              {isView
                ? 'Detalle de sesión'
                : mode === 'edit'
                  ? 'Editar sesión'
                  : 'Nueva sesión'}
            </DialogTitle>
            <DialogDescription>
              {isView
                ? 'Consulta la programación. Para proponer un cambio, usa el botón de sugerencia.'
                : 'Los cambios impactan la programación real del evento.'}
            </DialogDescription>
          </DialogHeader>

          {isView ? (
            <div className="mt-4 flex min-w-0 flex-col gap-4">
              <CampoVista label="Título" value={dash(form.titulo)} />
              <CampoVista
                label="Descripción"
                value={dash(form.descripcion)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoVista label="Formato" value={dash(form.formato)} />
                <CampoVista label="Escenario" value={dash(escenarioNombre)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoVista label="Track" value={trackLabel} />
                <CampoVista label="Idioma" value={dash(form.idioma)} />
              </div>
              <CampoVista label="Día" value={dash(form.dia)} />
              <div className="grid grid-cols-2 gap-3">
                <CampoVista label="Hora inicio" value={dash(form.horaInicio)} />
                <CampoVista label="Hora fin" value={dash(form.horaFin)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CampoVista
                  label="Capacidad de speakers"
                  value={dash(form.capacidadSpeakers)}
                />
                <CampoVista label="Estado" value={dash(form.estado)} />
              </div>

              <SpeakersAsignados
                sesionId={sesion?.id ?? null}
                capacidad={capacidadNum}
                onChanged={onSaved}
                readOnly
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cerrar
                </Button>
                {onSugerirCambio && (
                  <Button type="button" onClick={onSugerirCambio}>
                    Sugerir cambio a Agenda
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-4 flex min-w-0 flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sesion-titulo">Título *</Label>
                <Input
                  id="sesion-titulo"
                  value={form.titulo}
                  onChange={(e) => set('titulo', e.target.value)}
                  placeholder="Nombre de la sesión"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sesion-descripcion">Descripción</Label>
                <Textarea
                  id="sesion-descripcion"
                  value={form.descripcion}
                  onChange={(e) => set('descripcion', e.target.value)}
                  placeholder="Describe de qué trata esta sesión..."
                  rows={3}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Formato *</Label>
                  <Select
                    value={form.formato}
                    onValueChange={(value) => set('formato', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un formato" />
                    </SelectTrigger>
                    <SelectContent>
                      {formatos.map((formato) => (
                        <SelectItem key={formato.id} value={formato.nombre}>
                          {formato.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Escenario *</Label>
                  <div className="flex min-w-0 gap-2">
                    <Select
                      value={form.escenarioId}
                      onValueChange={(value) => set('escenarioId', value)}
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder="Selecciona un escenario" />
                      </SelectTrigger>
                      <SelectContent>
                        {escenarios.map((escenario) => (
                          <SelectItem key={escenario.id} value={escenario.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block size-2.5 shrink-0 rounded-sm"
                                style={{
                                  backgroundColor: normalizarColorEscenario(
                                    escenario.color,
                                    escenarios.findIndex(
                                      (e) => e.id === escenario.id,
                                    ),
                                  ),
                                }}
                              />
                              {escenario.nombre}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.escenarioId && (
                      <Select
                        value={colorEscenarioActivo ?? undefined}
                        onValueChange={(value) =>
                          void handleColorEscenario(value)
                        }
                        disabled={savingColor}
                      >
                        <SelectTrigger
                          className="w-[8.5rem] shrink-0"
                          aria-label="Color en calendario"
                        >
                          <SelectValue placeholder="Color" />
                        </SelectTrigger>
                        <SelectContent>
                          {COLORES_ESCENARIO.map(({ hex, label }) => (
                            <SelectItem key={hex} value={hex}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block size-2.5 shrink-0 rounded-sm border border-border/60"
                                  style={{ backgroundColor: hex }}
                                />
                                {label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Track</Label>
                  <Select
                    value={form.track}
                    onValueChange={(value) => set('track', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un track" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_TRACK}>Sin track</SelectItem>
                      {tracks.map((track) => (
                        <SelectItem key={track.id} value={track.nombre}>
                          {track.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Idioma</Label>
                  <Select
                    value={form.idioma}
                    onValueChange={(value) => set('idioma', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IDIOMAS_SESION.map((idioma) => (
                        <SelectItem key={idioma} value={idioma}>
                          {idioma}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sesion-dia">Día *</Label>
                <Input
                  id="sesion-dia"
                  type="date"
                  value={form.dia}
                  min={eventoRango.inicio || undefined}
                  max={eventoRango.fin || undefined}
                  onChange={(e) => set('dia', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sesion-hora-inicio">Hora inicio *</Label>
                  <Input
                    id="sesion-hora-inicio"
                    type="time"
                    value={form.horaInicio}
                    onChange={(e) => set('horaInicio', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sesion-hora-fin">Hora fin *</Label>
                  <Input
                    id="sesion-hora-fin"
                    type="time"
                    value={form.horaFin}
                    onChange={(e) => set('horaFin', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sesion-capacidad">Capacidad de speakers</Label>
                  <Input
                    id="sesion-capacidad"
                    type="number"
                    min={1}
                    max={CAPACIDAD_SPEAKERS_MAX}
                    value={form.capacidadSpeakers}
                    onChange={(e) => set('capacidadSpeakers', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={form.estado}
                    onValueChange={(value) => set('estado', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {form.estado &&
                        !estados.some((e) => e.nombre === form.estado) && (
                          <SelectItem value={form.estado}>
                            {form.estado}
                          </SelectItem>
                        )}
                      {estados.map((estado) => (
                        <SelectItem key={estado.id} value={estado.nombre}>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-block size-2 shrink-0 rounded-full',
                                estadoDotClass(estado.color),
                              )}
                            />
                            {estado.nombre}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <SpeakersAsignados
                sesionId={sesion?.id ?? null}
                capacidad={capacidadNum}
                onChanged={onSaved}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
