import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { InlineText } from '@/components/InlineText'
import { Navbar } from '@/components/layout/Navbar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext'
import { useOptimisticOverrides } from '@/hooks/useOptimisticOverrides'
import {
  contrasteSobreHex,
  COLORES_ESCENARIO_PALETTE,
} from '@/hooks/useSesionesData'
import {
  actualizarSpeaker,
  asociarSpeakerAEvento,
  useSpeakersData,
  type Speaker,
  type SpeakerEditable,
} from '@/hooks/useSpeakersData'
import {
  TableFilters,
  filaPasaFiltros,
  type FiltroActivo,
  type FiltroColumna,
} from '@/components/table-filters/TableFilters'
import { EliminarSpeakerDialog } from '@/pages/workspace/agenda/speakers/EliminarSpeakerDialog'
import { downloadSpeakersCsv } from '@/pages/workspace/agenda/speakers/exportSpeakersCsv'
import { SpeakerPerfilDialog } from '@/pages/workspace/agenda/speakers/SpeakerPerfilDialog'
import { FuenteBadge, iniciales } from '@/pages/workspace/agenda/speakers/speakerUtils'
import {
  FUENTES_SPEAKER,
  getValSpeaker,
  opcionesUnicas,
} from '@/pages/workspace/agenda/speakers/speakerFiltros'

// Foto, Nombre, Cargo, Empresa, País, Email, Teléfono, LinkedIn, Ciudad,
// Tipo Doc., Núm. Doc., Email secundario, Sesiones, Fuente, Eventos, Acciones
const COLS = 16

type CampoTexto = Extract<
  keyof SpeakerEditable,
  | 'nombre'
  | 'cargo'
  | 'empresa'
  | 'pais'
  | 'email'
  | 'telefono'
  | 'linkedin_url'
  | 'ciudad'
  | 'tipo_documento'
  | 'numero_documento'
  | 'email_secundario'
>
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailOpcional = (v: string) => v === '' || EMAIL_RE.test(v)
const toStr = (v: unknown): string => (v == null ? '' : String(v))

function colorPorEventoKey(key: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const bg =
    COLORES_ESCENARIO_PALETTE[hash % COLORES_ESCENARIO_PALETTE.length] ??
    '#42B3F3'
  return { bg, fg: contrasteSobreHex(bg) }
}

function EventosCell({
  speaker,
  workspaces,
  onAsociado,
}: {
  speaker: Speaker
  workspaces: Workspace[]
  onAsociado: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const asociadosIds = new Set(speaker.eventosAsociados.map((e) => e.id))
  const disponibles = workspaces.filter((w) => !asociadosIds.has(w.id))

  const badges =
    speaker.eventosAsociados.length > 0
      ? speaker.eventosAsociados.map((e) => ({
          key: e.id,
          nombre: e.nombre,
          ...colorPorEventoKey(e.id),
        }))
      : speaker.eventosParticipados.map((nombre) => {
          const ws = workspaces.find((w) => w.nombre === nombre)
          const key = ws?.id ?? nombre
          return { key, nombre, ...colorPorEventoKey(key) }
        })

  async function handleAsignar(eventoId: string) {
    if (!eventoId || busy) return
    setBusy(true)
    try {
      const { created } = await asociarSpeakerAEvento(eventoId, speaker.id)
      const nombre =
        workspaces.find((w) => w.id === eventoId)?.nombre ?? 'evento'
      toast.success(
        created
          ? `«${speaker.nombre}» asociado a ${nombre}`
          : `Ya estaba asociado a ${nombre}`,
      )
      setOpen(false)
      onAsociado()
    } catch (err) {
      toast.error(
        `No se pudo asociar: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setBusy(false)
    }
  }

  const puedeAsignar = disponibles.length > 0

  const badgesEl =
    badges.length === 0 ? (
      <Badge className="bg-muted font-normal text-muted-foreground">
        {puedeAsignar ? 'Asignar a evento…' : 'Sin eventos'}
      </Badge>
    ) : (
      badges.map((b) => (
        <Badge
          key={b.key}
          className="border-0 font-medium"
          style={{ backgroundColor: b.bg, color: b.fg }}
        >
          {b.nombre}
        </Badge>
      ))
    )

  if (!puedeAsignar) {
    return (
      <div className="flex max-w-[240px] flex-wrap items-center gap-1">
        {badgesEl}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-[240px] flex-wrap items-center gap-1 rounded-md text-left outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Eventos de ${speaker.nombre}. Abrir para asignar`}
        >
          {badgesEl}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Asignar a evento
        </p>
        <ul className="max-h-56 overflow-y-auto">
          {disponibles.map((ws) => {
            const { bg, fg } = colorPorEventoKey(ws.id)
            return (
              <li key={ws.id}>
                <button
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => void handleAsignar(ws.id)}
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: bg,
                      boxShadow: `inset 0 0 0 1px ${fg}33`,
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{ws.nombre}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function CrmGlobal() {
  const navigate = useNavigate()
  const { workspace, workspaces } = useWorkspace()
  const eventoId = workspace?.id ?? workspaces[0]?.id ?? ''
  const { speakers, propiedades, loading, error, refetch } = useSpeakersData(
    null,
    { global: true },
  )
  const [busqueda, setBusqueda] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [modo, setModo] = useState<'create' | 'edit'>('create')
  const [activo, setActivo] = useState<Speaker | null>(null)
  const [speakerAEliminar, setSpeakerAEliminar] = useState<Speaker | null>(null)
  const [filtros, setFiltros] = useState<FiltroActivo[]>([])

  const filterColumns: FiltroColumna[] = useMemo(
    () => [
      {
        campo: 'pais',
        etiqueta: 'País',
        tipo: 'select',
        opciones: opcionesUnicas(speakers, 'pais'),
      },
      {
        campo: 'ciudad',
        etiqueta: 'Ciudad',
        tipo: 'select',
        opciones: opcionesUnicas(speakers, 'ciudad'),
      },
      {
        campo: 'fuente',
        etiqueta: 'Fuente',
        tipo: 'select',
        opciones: FUENTES_SPEAKER,
      },
      { campo: '_conSesiones', etiqueta: 'Tiene sesiones', tipo: 'boolean' },
      {
        campo: '_conEventos',
        etiqueta: 'Participa en algún evento',
        tipo: 'boolean',
      },
    ],
    [speakers],
  )

  const ov = useOptimisticOverrides<CampoTexto>()
  const campoActual = (sp: Speaker, campo: CampoTexto): string =>
    toStr(ov.get(sp.id, campo, sp[campo]))
  const guardarCampo = (sp: Speaker, campo: CampoTexto, valor: string) =>
    ov.commit(sp.id, campo, valor, toStr(sp[campo]), () =>
      actualizarSpeaker(sp.id, { [campo]: valor } as Partial<SpeakerEditable>),
    )

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return speakers.filter((sp) => {
      if (
        term &&
        ![sp.nombre, sp.cargo, sp.empresa, sp.email, ...sp.eventosParticipados]
          .filter(Boolean)
          .some((campo) => campo!.toLowerCase().includes(term))
      ) {
        return false
      }
      return filaPasaFiltros((campo) => getValSpeaker(sp, campo, {}), filtros)
    })
  }, [speakers, busqueda, filtros])

  function abrirCrear() {
    setModo('create')
    setActivo(null)
    setDialogOpen(true)
  }

  function abrirEditar(speaker: Speaker) {
    setModo('edit')
    setActivo(speaker)
    setDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-8 py-10">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver al Home
        </button>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-secondary">
          CRM
        </p>
        <h1 className="text-3xl font-semibold">Directorio de speakers</h1>
        <p className="mt-1 font-light text-muted-foreground">
          Pool global de speakers, todos los eventos.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, cargo, empresa o email…"
                className="h-8 w-72"
              />
              <TableFilters
                columnas={filterColumns}
                filtros={filtros}
                onChange={setFiltros}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={filtrados.length === 0}
                onClick={() => {
                  downloadSpeakersCsv(filtrados)
                  toast.success(
                    `CSV exportado (${filtrados.length} speaker${filtrados.length === 1 ? '' : 's'})`,
                  )
                }}
              >
                <Download /> Exportar CSV
              </Button>
              <Button onClick={abrirCrear}>
                <UserPlus /> Agregar speaker
              </Button>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {!loading && speakers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No hay speakers registrados aún.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Foto</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>País</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>LinkedIn</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Tipo Doc.</TableHead>
                    <TableHead>Núm. Doc.</TableHead>
                    <TableHead>Email secundario</TableHead>
                    <TableHead>Sesiones</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Eventos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: COLS }).map((__, c) => (
                          <TableCell key={c}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}

                  {!loading &&
                    filtrados.length === 0 &&
                    speakers.length > 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={COLS}
                          className="py-10 text-center text-sm text-muted-foreground"
                        >
                          Ningún speaker coincide con la búsqueda o los filtros.
                        </TableCell>
                      </TableRow>
                    )}

                  {!loading &&
                    filtrados.map((sp) => (
                      <TableRow key={sp.id}>
                        <TableCell>
                          <Avatar size="sm">
                            {sp.foto_url && (
                              <AvatarImage src={sp.foto_url} alt={sp.nombre} />
                            )}
                            <AvatarFallback>
                              {iniciales(sp.nombre)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <InlineText
                            value={campoActual(sp, 'nombre')}
                            placeholder="Sin nombre"
                            displayClassName="font-semibold"
                            onSave={(v) => guardarCampo(sp, 'nombre', v)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'cargo')}
                            onSave={(v) => guardarCampo(sp, 'cargo', v)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'empresa')}
                            onSave={(v) => guardarCampo(sp, 'empresa', v)}
                          />
                        </TableCell>
                        <TableCell>
                          <InlineText
                            value={campoActual(sp, 'pais')}
                            onSave={(v) => guardarCampo(sp, 'pais', v)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[200px] text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'email')}
                            validate={(v) => EMAIL_RE.test(v)}
                            onSave={(v) => guardarCampo(sp, 'email', v)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'telefono')}
                            onSave={(v) => guardarCampo(sp, 'telefono', v)}
                          />
                        </TableCell>
                        <TableCell className="max-w-[160px] text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'linkedin_url')}
                            displayClassName="truncate text-secondary"
                            onSave={(v) =>
                              guardarCampo(sp, 'linkedin_url', v)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'ciudad')}
                            onSave={(v) => guardarCampo(sp, 'ciudad', v)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'tipo_documento')}
                            onSave={(v) =>
                              guardarCampo(sp, 'tipo_documento', v)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'numero_documento')}
                            onSave={(v) =>
                              guardarCampo(sp, 'numero_documento', v)
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-[200px] text-muted-foreground">
                          <InlineText
                            value={campoActual(sp, 'email_secundario')}
                            validate={emailOpcional}
                            onSave={(v) =>
                              guardarCampo(sp, 'email_secundario', v)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {sp.sesionesEnEvento > 0 ? (
                            <Badge variant="secondary">
                              {sp.sesionesEnEvento} sesión
                              {sp.sesionesEnEvento === 1 ? '' : 'es'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sin sesiones
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <FuenteBadge fuente={sp.fuente} />
                        </TableCell>
                        <TableCell>
                          <EventosCell
                            speaker={sp}
                            workspaces={workspaces}
                            onAsociado={refetch}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${sp.nombre}`}
                              onClick={() => abrirEditar(sp)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Eliminar ${sp.nombre}`}
                              onClick={() => setSpeakerAEliminar(sp)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      <EliminarSpeakerDialog
        speaker={speakerAEliminar}
        eventoId={eventoId}
        modo="crm"
        onOpenChange={(open) => !open && setSpeakerAEliminar(null)}
        onDeleted={refetch}
      />

      <SpeakerPerfilDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={modo}
        speaker={activo}
        eventoId={eventoId}
        onSaved={refetch}
        propiedadesEvento={propiedades}
      />
    </div>
  )
}
