import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  actualizarSpeaker,
  crearSpeaker,
  guardarValorPropiedad,
  propiedadesSpeaker,
  sesionesDeSpeaker,
  valoresSpeaker,
  type ParticipacionSesion,
  type PropiedadCustom,
  type Speaker,
  type SpeakerEditable,
} from '@/hooks/useSpeakersData'
import { formatDiaLargo } from '../sesiones/format'
import { NuevaPropiedadDialog } from './NuevaPropiedadDialog'
import { asChecklist, iniciales } from './speakerUtils'

const CAMPOS: { key: keyof SpeakerEditable; label: string; required?: boolean }[] = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'cargo', label: 'Cargo' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'pais', label: 'País' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'email', label: 'Email', required: true },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'tipo_documento', label: 'Tipo de documento' },
  { key: 'numero_documento', label: 'Número de documento' },
  { key: 'email_secundario', label: 'Email secundario' },
]


type FormState = Record<keyof SpeakerEditable, string>

function initialForm(speaker: Speaker | null): FormState {
  return {
    nombre: speaker?.nombre ?? '',
    cargo: speaker?.cargo ?? '',
    empresa: speaker?.empresa ?? '',
    pais: speaker?.pais ?? '',
    ciudad: speaker?.ciudad ?? '',
    email: speaker?.email ?? '',
    telefono: speaker?.telefono ?? '',
    linkedin_url: speaker?.linkedin_url ?? '',
    tipo_documento: speaker?.tipo_documento ?? '',
    numero_documento: speaker?.numero_documento ?? '',
    email_secundario: speaker?.email_secundario ?? '',
    bio: speaker?.bio ?? '',
  }
}

type SpeakerPerfilDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  speaker: Speaker | null
  eventoId: string
  onSaved: () => void
}

export function SpeakerPerfilDialog({
  open,
  onOpenChange,
  mode,
  speaker,
  eventoId,
  onSaved,
}: SpeakerPerfilDialogProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(speaker))
  const [saving, setSaving] = useState(false)

  const [participaciones, setParticipaciones] = useState<ParticipacionSesion[]>(
    [],
  )
  const [propiedades, setPropiedades] = useState<PropiedadCustom[]>([])
  const [valores, setValores] = useState<Record<string, unknown>>({})
  const [cargandoDerecha, setCargandoDerecha] = useState(false)

  const [nuevoItem, setNuevoItem] = useState<Record<string, string>>({})

  const speakerId = speaker?.id ?? null

  useEffect(() => {
    if (open) {
      setForm(initialForm(speaker))
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, speakerId])

  async function recargarSeguimiento() {
    if (!speakerId) return
    setCargandoDerecha(true)
    const [ses, props] = await Promise.all([
      sesionesDeSpeaker(speakerId, eventoId),
      propiedadesSpeaker(eventoId),
    ])
    if (ses.error) toast.error(`Participación: ${ses.error}`)
    if (props.error) toast.error(`Propiedades: ${props.error}`)
    setParticipaciones(ses.data)
    setPropiedades(props.data)
    const vals = await valoresSpeaker(
      speakerId,
      props.data.map((p) => p.id),
    )
    if (vals.error) toast.error(`Valores: ${vals.error}`)
    setValores(vals.data)
    setCargandoDerecha(false)
  }

  useEffect(() => {
    if (open && mode === 'edit' && speakerId) void recargarSeguimiento()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, speakerId, eventoId])

  const set = (key: keyof SpeakerEditable, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleGuardar() {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y email son obligatorios.')
      return
    }
    const datos: Partial<SpeakerEditable> = { ...form }
    setSaving(true)
    try {
      if (mode === 'edit' && speaker) {
        await actualizarSpeaker(speaker.id, datos)
        toast.success('Speaker actualizado')
      } else {
        await crearSpeaker(datos)
        toast.success('Speaker creado')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  async function persistirValor(propiedadId: string, valor: unknown) {
    if (!speakerId) return
    setValores((prev) => ({ ...prev, [propiedadId]: valor }))
    try {
      await guardarValorPropiedad(speakerId, propiedadId, valor)
    } catch (err) {
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  function toggleItem(prop: PropiedadCustom, index: number) {
    const items = asChecklist(valores[prop.id])
    const next = items.map((item, i) =>
      i === index ? { ...item, checked: !item.checked } : item,
    )
    void persistirValor(prop.id, next)
  }

  function agregarItem(prop: PropiedadCustom) {
    const label = (nuevoItem[prop.id] ?? '').trim()
    if (!label) return
    const next = [...asChecklist(valores[prop.id]), { label, checked: false }]
    setNuevoItem((prev) => ({ ...prev, [prop.id]: '' }))
    void persistirValor(prop.id, next)
  }

  async function handlePropiedadCreada() {
    await recargarSeguimiento()
    // La propiedad es global del evento: refresca la tabla para que
    // aparezca como columna para todos los speakers.
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[832px] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] max-h-[880px] overflow-y-auto bg-white p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle>
              {mode === 'edit' ? 'Perfil del speaker' : 'Nuevo speaker'}
            </DialogTitle>
            <DialogDescription>
              Datos del pool global de speakers y su seguimiento en este evento.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-6 md:grid-cols-2">
          {/* ── Columna izquierda: datos ─────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                {speaker?.foto_url && (
                  <AvatarImage src={speaker.foto_url} alt={form.nombre} />
                )}
                <AvatarFallback>
                  {iniciales(form.nombre || 'NN')}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium">
                {form.nombre || 'Sin nombre'}
              </p>
            </div>

            {CAMPOS.map((campo) => (
              <div key={campo.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`sp-${campo.key}`}>
                  {campo.label}
                  {campo.required ? ' *' : ''}
                </Label>
                <Input
                  id={`sp-${campo.key}`}
                  value={form[campo.key]}
                  onChange={(e) => set(campo.key, e.target.value)}
                />
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sp-bio">Bio</Label>
              <Textarea
                id="sp-bio"
                rows={4}
                value={form.bio}
                onChange={(e) => set('bio', e.target.value)}
              />
            </div>

            <Button onClick={handleGuardar} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>

          {/* ── Columna derecha: participación + seguimiento ──────── */}
          <div className="flex flex-col gap-4">
            {mode === 'create' || !speakerId ? (
              <p className="text-sm text-muted-foreground">
                Guarda el speaker para ver su participación y seguimiento.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">
                    Participación en eventos
                  </h3>
                  {cargandoDerecha && (
                    <p className="text-xs text-muted-foreground">Cargando…</p>
                  )}
                  {!cargandoDerecha && participaciones.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No participa en ninguna sesión de este evento.
                    </p>
                  )}
                  {participaciones.map((p) => (
                    <div
                      key={p.sesionId}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs"
                    >
                      <p className="font-medium">{p.titulo || 'Sin título'}</p>
                      <p className="text-muted-foreground">
                        {formatDiaLargo(p.dia)} · {p.horaInicio}–{p.horaFin} ·{' '}
                        {p.escenario || 'Sin escenario'}
                      </p>
                      {p.rol && (
                        <p className="text-muted-foreground">Rol: {p.rol}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-border" />

                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">Seguimiento</h3>
                  {!cargandoDerecha && propiedades.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sin propiedades de seguimiento en este evento.
                    </p>
                  )}

                  {propiedades.map((prop) => (
                    <div key={prop.id} className="flex flex-col gap-1.5">
                      <Label className="text-xs">{prop.nombre}</Label>

                      {prop.tipo === 'checklist' && (
                        <div className="flex flex-col gap-2">
                          {asChecklist(valores[prop.id]).map((item, index) => {
                            const cbId = `chk-${prop.id}-${index}`
                            return (
                              <div
                                key={index}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id={cbId}
                                  checked={item.checked}
                                  onCheckedChange={() =>
                                    toggleItem(prop, index)
                                  }
                                />
                                <label
                                  htmlFor={cbId}
                                  className={`cursor-pointer text-xs ${
                                    item.checked
                                      ? 'text-muted-foreground line-through'
                                      : ''
                                  }`}
                                >
                                  {item.label}
                                </label>
                              </div>
                            )
                          })}
                          <div className="flex items-center gap-2">
                            <Input
                              value={nuevoItem[prop.id] ?? ''}
                              onChange={(e) =>
                                setNuevoItem((prev) => ({
                                  ...prev,
                                  [prop.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  agregarItem(prop)
                                }
                              }}
                              placeholder="Nueva tarea…"
                              className="h-8 flex-1 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => agregarItem(prop)}
                            >
                              Añadir
                            </Button>
                          </div>
                        </div>
                      )}

                      {prop.tipo === 'texto' && (
                        <Input
                          defaultValue={String(valores[prop.id] ?? '')}
                          onBlur={(e) =>
                            persistirValor(prop.id, e.target.value)
                          }
                          className="h-8 text-xs"
                        />
                      )}

                      {prop.tipo === 'select' && (
                        <Select
                          value={String(valores[prop.id] ?? '')}
                          onValueChange={(value) =>
                            persistirValor(prop.id, value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecciona…" />
                          </SelectTrigger>
                          <SelectContent>
                            {prop.opciones.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {prop.tipo === 'fecha' && (
                        <Input
                          type="date"
                          value={String(valores[prop.id] ?? '')}
                          onChange={(e) =>
                            persistirValor(prop.id, e.target.value)
                          }
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}

                  <div>
                    <NuevaPropiedadDialog
                      eventoId={eventoId}
                      onCreada={handlePropiedadCreada}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
