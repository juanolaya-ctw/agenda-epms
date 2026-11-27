import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Download, Link } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
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
  asociarSpeakerAEvento,
  crearSpeaker,
  guardarValorPropiedad,
  propiedadesSpeaker,
  sesionesDeSpeaker,
  speakerPorEmail,
  valoresSpeaker,
  type ParticipacionSesion,
  type PropiedadCustom,
  type Speaker,
  type SpeakerEditable,
} from '@/hooks/useSpeakersData'
import { planAltaSpeaker } from '@/lib/altaSpeaker'
import { formatDiaLargo } from '../sesiones/format'
import { NuevaPropiedadDialog } from './NuevaPropiedadDialog'
import { asChecklist, iniciales, toolkitUrl } from './speakerUtils'

const CAMPOS: { key: keyof SpeakerEditable; label: string; required?: boolean }[] = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'cargo', label: 'Cargo' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'pais', label: 'País' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'email', label: 'Email' },
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
  /** Solo consulta (CS / Sales): sin guardar ni editar. */
  readOnly?: boolean
  /** Tras crear en el workspace, asocia el speaker al evento. */
  asociarAlCrear?: boolean
  /** Muestra el toolkit de esta membresía. El CRM global no lo muestra. */
  mostrarToolkit?: boolean
  /** Dominio https del toolkit de este evento. */
  toolkitBaseUrl?: string | null
  /** CRM: el email ya existe y hay que abrir esa ficha, no crear otra. */
  onAbrirExistente?: (speaker: Speaker) => void
  /** Propiedades del evento ya cargadas por el padre (evita refetch). */
  propiedadesEvento?: PropiedadCustom[]
  /** Valores de este speaker ya cargados por el padre (evita refetch). */
  valoresDelSpeaker?: Record<string, unknown>
}

export function SpeakerPerfilDialog({
  open,
  onOpenChange,
  mode,
  speaker,
  eventoId,
  onSaved,
  readOnly = false,
  asociarAlCrear = false,
  mostrarToolkit = false,
  toolkitBaseUrl = null,
  onAbrirExistente,
  propiedadesEvento,
  valoresDelSpeaker,
}: SpeakerPerfilDialogProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(speaker))
  const [saving, setSaving] = useState(false)
  const [fotoUrl, setFotoUrl] = useState<string | null>(speaker?.foto_url ?? null)
  const [fotoPendiente, setFotoPendiente] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [descargandoFoto, setDescargandoFoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [participaciones, setParticipaciones] = useState<ParticipacionSesion[]>(
    [],
  )
  const [propiedades, setPropiedades] = useState<PropiedadCustom[]>([])
  const [valores, setValores] = useState<Record<string, unknown>>({})
  const [cargandoDerecha, setCargandoDerecha] = useState(false)

  const [nuevoItem, setNuevoItem] = useState<Record<string, string>>({})

  const speakerId = speaker?.id ?? null
  const [recursos, setRecursos] = useState<{
    toolkit_slug: string | null
    link_pieza_fase1: string | null
    link_pieza_fase2: string | null
    link_pieza_fase3: string | null
    estado_pieza: string | null
  } | null>(null)

  const slugToolkit = mostrarToolkit
    ? (recursos?.toolkit_slug ?? speaker?.toolkit_slug ?? null)
    : null
  const linkToolkit = toolkitUrl(toolkitBaseUrl, slugToolkit)

  useEffect(() => {
    if (open) {
      setForm(initialForm(speaker))
      setSaving(false)
      setFotoUrl(speaker?.foto_url ?? null)
      setFotoPendiente(null)
      setSubiendoFoto(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, speakerId])

  useEffect(() => {
    if (!fotoPendiente) {
      setPreviewObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const url = URL.createObjectURL(fotoPendiente)
    setPreviewObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    return () => URL.revokeObjectURL(url)
  }, [fotoPendiente])

  const fotoVisible = previewObjectUrl ?? fotoUrl
  const puedeEditarFoto = !readOnly && (mode === 'edit' ? Boolean(speaker) : true)

  // La tabla ahora trae solo columnas ligeras; al abrir un perfil se hace
  // un point-lookup por PK para poblar el formulario completo (bio, doc,
  // teléfono, etc.). Una sola query indexada.
  useEffect(() => {
    if (!open || !mostrarToolkit || mode !== 'edit' || !speakerId) {
      setRecursos(null)
      return
    }
    let cancelled = false
    supabase
      .from('evento_speakers')
      .select(
        'toolkit_slug, link_pieza_fase1, link_pieza_fase2, link_pieza_fase3, estado_pieza',
      )
      .eq('evento_id', eventoId)
      .eq('speaker_id', speakerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          setRecursos(null)
          return
        }
        const row = data as {
          toolkit_slug: string | null
          link_pieza_fase1: string | null
          link_pieza_fase2: string | null
          link_pieza_fase3: string | null
          estado_pieza: string | null
        }
        setRecursos(row)
      })
    return () => {
      cancelled = true
    }
  }, [open, mostrarToolkit, mode, speakerId, eventoId])

  useEffect(() => {
    if (!open || mode !== 'edit' || !speakerId) return
    let cancelled = false
    supabase
      .from('speakers')
      .select('*')
      .eq('id', speakerId)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setForm(initialForm(data as unknown as Speaker))
        setFotoUrl((data as { foto_url?: string | null }).foto_url ?? null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, speakerId])

  const tienePropsDelPadre = propiedadesEvento !== undefined

  async function recargarSeguimiento() {
    if (!speakerId) return
    setCargandoDerecha(true)

    // Participación siempre se pide (el padre no la tiene). Propiedades y
    // valores se reutilizan del padre si los pasó.
    const ses = await sesionesDeSpeaker(speakerId, eventoId)
    if (ses.error) toast.error(`Participación: ${ses.error}`)
    setParticipaciones(ses.data)

    if (tienePropsDelPadre) {
      setPropiedades(propiedadesEvento ?? [])
      setValores(valoresDelSpeaker ?? {})
      setCargandoDerecha(false)
      return
    }

    const props = await propiedadesSpeaker(eventoId)
    if (props.error) toast.error(`Propiedades: ${props.error}`)
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

  // Si el padre refresca sus propiedades/valores mientras el diálogo está
  // abierto (p. ej. tras crear una propiedad), sincroniza sin refetch.
  useEffect(() => {
    if (!open || !tienePropsDelPadre) return
    setPropiedades(propiedadesEvento ?? [])
    setValores(valoresDelSpeaker ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propiedadesEvento, valoresDelSpeaker])

  const set = (key: keyof SpeakerEditable, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () =>
        reject(reader.error ?? new Error('No se pudo leer el archivo'))
      reader.readAsArrayBuffer(file)
    })
  }

  async function subirFotoSpeaker(
    speakerId: string,
    file: File,
    emailHint?: string,
  ): Promise<string> {
    const ext =
      file.name.split('.').pop()?.toLowerCase() ||
      file.type.split('/')[1] ||
      'jpg'
    const email = emailHint || form.email || speakerId
    const filename = `speakers/${email}-${Date.now()}.${ext}`
    const arrayBuffer = await readAsArrayBuffer(file)
    const { error: uploadError } = await supabase.storage
      .from('speaker-fotos')
      .upload(filename, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })
    if (uploadError) throw new Error(uploadError.message)

    const { data } = supabase.storage
      .from('speaker-fotos')
      .getPublicUrl(filename)

    const { error: updateError } = await supabase
      .from('speakers')
      .update({ foto_url: data.publicUrl })
      .eq('id', speakerId)
    if (updateError) throw new Error(updateError.message)

    return data.publicUrl
  }

  async function handleFotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    // En creación: preview local; se sube al guardar.
    if (mode === 'create' || !speaker) {
      setFotoPendiente(file)
      return
    }

    setSubiendoFoto(true)
    try {
      const publicUrl = await subirFotoSpeaker(
        speaker.id,
        file,
        speaker.email || form.email,
      )
      setFotoUrl(publicUrl)
      setFotoPendiente(null)
      toast.success('Foto actualizada')
      onSaved()
    } catch (err) {
      toast.error(
        `No se pudo subir la foto: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setSubiendoFoto(false)
    }
  }

  function pathFotoStorage(url: string): string | null {
    const marker = '/object/public/speaker-fotos/'
    const index = url.indexOf(marker)
    if (index < 0) return null
    return decodeURIComponent(url.slice(index + marker.length))
  }

  function nombreArchivoFoto(type: string): string {
    const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const base =
      (form.nombre || speaker?.email || 'speaker')
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'speaker'
    return `${base}.${ext}`
  }

  async function handleDescargarFoto() {
    if (!fotoUrl) return
    setDescargandoFoto(true)
    try {
      let blob: Blob
      const path = pathFotoStorage(fotoUrl)
      if (path) {
        const { data, error } = await supabase.storage
          .from('speaker-fotos')
          .download(path)
        if (error || !data) throw new Error(error?.message ?? 'Sin archivo')
        blob = data
      } else {
        const res = await fetch(fotoUrl)
        if (!res.ok) throw new Error('No se pudo obtener la imagen')
        blob = await res.blob()
      }
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = nombreArchivoFoto(blob.type)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      toast.error(
        `No se pudo descargar la foto: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setDescargandoFoto(false)
    }
  }

  async function resolverEmailExistente(email: string): Promise<boolean> {
    const existente = await speakerPorEmail(email)
    const plan = planAltaSpeaker({
      existenteId: existente?.id ?? null,
      asociarAlEvento: asociarAlCrear,
    })
    if (!existente || plan.tipo === 'crear') return false
    if (plan.tipo === 'asociar_existente') {
      const { created } = await asociarSpeakerAEvento(eventoId, existente.id)
      toast.success(
        created
          ? `«${existente.nombre}» ya existía en el directorio y se asoció al evento`
          : `«${existente.nombre}» ya estaba asociado a este evento`,
      )
      onOpenChange(false)
      onSaved()
      return true
    }
    toast.success(
      `«${existente.nombre}» ya está en el directorio. Se abrió su ficha.`,
    )
    onAbrirExistente?.(existente)
    return true
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    const emailTrim = form.email.trim()
    if (
      emailTrim &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim.toLowerCase())
    ) {
      toast.error('Email inválido.')
      return
    }
    const datos: Partial<SpeakerEditable> = { ...form }
    setSaving(true)
    try {
      if (mode === 'edit' && speaker) {
        await actualizarSpeaker(speaker.id, datos)
        toast.success('Speaker actualizado')
      } else {
        if (emailTrim) {
          const yaResuelto = await resolverEmailExistente(form.email)
          if (yaResuelto) return
        }

        let newId: string
        try {
          newId = await crearSpeaker(datos)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const esDuplicado =
            /duplicate|unique|already exists|speakers_email/i.test(msg)
          if (!esDuplicado || !emailTrim) throw err
          const yaResuelto = await resolverEmailExistente(form.email)
          if (yaResuelto) return
          throw err
        }

        if (asociarAlCrear) {
          await asociarSpeakerAEvento(eventoId, newId)
        }

        if (fotoPendiente) {
          try {
            await subirFotoSpeaker(
              newId,
              fotoPendiente,
              emailTrim || newId,
            )
          } catch (fotoErr) {
            toast.error(
              `Speaker creado, pero no se pudo subir la foto: ${
                fotoErr instanceof Error ? fotoErr.message : String(fotoErr)
              }`,
            )
            onOpenChange(false)
            onSaved()
            return
          }
        }

        toast.success(
          asociarAlCrear
            ? 'Speaker creado y asociado al evento'
            : 'Speaker creado',
        )
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

  async function copiarToolkit() {
    if (!linkToolkit) return
    try {
      await navigator.clipboard.writeText(linkToolkit)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
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
    // La propiedad es global del evento: refresca la tabla para que
    // aparezca como columna para todos los speakers.
    onSaved()
    // El padre tarda un tick en recargar; trae la propiedad nueva del
    // servidor para reflejarla de inmediato en el diálogo.
    if (!speakerId) return
    const props = await propiedadesSpeaker(eventoId)
    setPropiedades(props.data)
    const vals = await valoresSpeaker(
      speakerId,
      props.data.map((p) => p.id),
    )
    setValores(vals.data)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[832px] max-h-[85vh] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white p-0 sm:max-w-[calc(100vw-2rem)]">
        <div className="shrink-0 px-6 pt-6">
          <DialogHeader>
            <DialogTitle>
              {mode === 'edit' ? 'Perfil del speaker' : 'Nuevo speaker'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create' && asociarAlCrear
                ? 'Se crea en el directorio global y se asocia a este evento. Si el email ya existe, se asociará el perfil existente.'
                : mode === 'create'
                  ? 'Se crea en el directorio global. Si el email ya existe, se abre esa ficha.'
                  : 'Datos del pool global de speakers y su seguimiento en este evento.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] overflow-hidden">
          {/* ── Columna izquierda: datos ─────────────────────────── */}
          <div className="flex flex-col gap-3 overflow-y-auto p-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!puedeEditarFoto || subiendoFoto}
                onClick={() => fileInputRef.current?.click()}
                className="group relative shrink-0 cursor-pointer rounded-full disabled:cursor-default"
                title={puedeEditarFoto ? 'Cambiar foto' : undefined}
                aria-label={puedeEditarFoto ? 'Cambiar foto' : undefined}
              >
                <Avatar size="lg">
                  {fotoVisible && (
                    <AvatarImage src={fotoVisible} alt={form.nombre} />
                  )}
                  <AvatarFallback>
                    {iniciales(form.nombre || 'NN')}
                  </AvatarFallback>
                </Avatar>
                {puedeEditarFoto && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="size-4" />
                  </span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFotoChange}
                disabled={!puedeEditarFoto}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-sm font-medium">
                  {form.nombre || 'Sin nombre'}
                </p>
                {mode === 'create' && fotoPendiente && (
                  <p className="text-xs text-muted-foreground">
                    Foto lista; se subirá al guardar.
                  </p>
                )}
                {fotoUrl && !fotoPendiente && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={descargandoFoto}
                    onClick={() => void handleDescargarFoto()}
                  >
                    <Download />
                    {descargandoFoto ? 'Descargando…' : 'Descargar foto'}
                  </Button>
                )}
              </div>
            </div>

            {CAMPOS.map((campo) => (
              <div key={campo.key} className="flex w-full flex-col gap-1.5">
                <Label htmlFor={`sp-${campo.key}`}>
                  {campo.label}
                  {campo.required ? ' *' : ''}
                </Label>
                <Input
                  id={`sp-${campo.key}`}
                  className="w-full"
                  value={form[campo.key]}
                  onChange={(e) => set(campo.key, e.target.value)}
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
            ))}

            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="sp-bio">Bio</Label>
              <Textarea
                id="sp-bio"
                className="w-full"
                rows={4}
                value={form.bio}
                onChange={(e) => set('bio', e.target.value)}
                readOnly={readOnly}
                disabled={readOnly}
              />
            </div>

            {!readOnly && (
              <Button onClick={handleGuardar} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            )}
          </div>

          {/* ── Columna derecha: participación + seguimiento ──────── */}
          <div className="flex flex-col gap-4 overflow-y-auto p-6">
            {mostrarToolkit && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Toolkit de este evento</h3>
                {linkToolkit ? (
                  <>
                    <p className="break-all rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
                      {linkToolkit}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => void copiarToolkit()}
                    >
                      <Link />
                      Copiar link ↗
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {slugToolkit
                      ? 'Hay un identificador de toolkit, pero este evento no tiene dominio configurado.'
                      : 'Sin toolkit en este evento.'}
                  </p>
                )}
                {recursos?.estado_pieza && (
                  <p className="text-xs text-muted-foreground">
                    Estado de la pieza: {recursos.estado_pieza}
                  </p>
                )}
                {[
                  ['Fase 1', recursos?.link_pieza_fase1],
                  ['Fase 2', recursos?.link_pieza_fase2],
                  ['Fase 3', recursos?.link_pieza_fase3],
                ].map(([fase, url]) =>
                  url ? (
                    <a
                      key={fase}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-xs text-secondary underline"
                    >
                      Pieza {fase}
                    </a>
                  ) : null,
                )}
              </div>
            )}

            {mostrarToolkit && <div className="border-t border-border" />}

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

                  {propiedades.map((prop) =>
                    prop.tipo === 'checkbox' ? (
                      <label
                        key={prop.id}
                        className="flex items-center gap-2 text-xs font-medium"
                      >
                        <Checkbox
                          checked={
                            valores[prop.id] === true ||
                            valores[prop.id] === 'true'
                          }
                          disabled={readOnly}
                          onCheckedChange={
                            readOnly
                              ? undefined
                              : (checked) =>
                                  void persistirValor(prop.id, checked === true)
                          }
                        />
                        {prop.nombre}
                      </label>
                    ) : (
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
                                  disabled={readOnly}
                                  onCheckedChange={
                                    readOnly
                                      ? undefined
                                      : () => toggleItem(prop, index)
                                  }
                                />
                                <label
                                  htmlFor={cbId}
                                  className={`text-xs ${
                                    item.checked
                                      ? 'text-muted-foreground line-through'
                                      : ''
                                  } ${readOnly ? '' : 'cursor-pointer'}`}
                                >
                                  {item.label}
                                </label>
                              </div>
                            )
                          })}
                          {!readOnly && (
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
                          )}
                        </div>
                      )}

                      {prop.tipo === 'texto' &&
                        (readOnly ? (
                          <p className="text-xs text-muted-foreground">
                            {String(valores[prop.id] ?? '—')}
                          </p>
                        ) : (
                          <Input
                            defaultValue={String(valores[prop.id] ?? '')}
                            onBlur={(e) =>
                              persistirValor(prop.id, e.target.value)
                            }
                            className="h-8 text-xs"
                          />
                        ))}

                      {prop.tipo === 'select' &&
                        (readOnly ? (
                          <p className="text-xs text-muted-foreground">
                            {String(valores[prop.id] ?? '—')}
                          </p>
                        ) : (
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
                        ))}

                      {prop.tipo === 'fecha' &&
                        (readOnly ? (
                          <p className="text-xs text-muted-foreground">
                            {String(valores[prop.id] ?? '—')}
                          </p>
                        ) : (
                          <Input
                            type="date"
                            value={String(valores[prop.id] ?? '')}
                            onChange={(e) =>
                              persistirValor(prop.id, e.target.value)
                            }
                            className="h-8 text-xs"
                          />
                        ))}
                    </div>
                    ),
                  )}

                  {!readOnly && (
                    <div>
                      <NuevaPropiedadDialog
                        eventoId={eventoId}
                        onCreada={handlePropiedadCreada}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
