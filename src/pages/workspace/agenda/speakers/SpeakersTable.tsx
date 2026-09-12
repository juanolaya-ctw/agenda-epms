import { useMemo, useState } from 'react'
import { Link, Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  actualizarSpeaker,
  guardarValorPropiedad,
  type PropiedadCustom,
  type Speaker,
  type SpeakerEditable,
  useSpeakersData,
} from '@/hooks/useSpeakersData'
import { InlineText } from '@/components/InlineText'
import {
  TableFilters,
  filaPasaFiltros,
  type FiltroActivo,
  type FiltroColumna,
} from '@/components/table-filters/TableFilters'
import { SpeakerPerfilDialog } from './SpeakerPerfilDialog'
import { PropiedadEditarDialog } from './PropiedadEditarDialog'
import { NuevaPropiedadDialog } from './NuevaPropiedadDialog'
import { EliminarSpeakerDialog } from './EliminarSpeakerDialog'
import {
  FuenteBadge,
  iniciales,
  resumenValor,
  toolkitUrl,
} from './speakerUtils'
import {
  FUENTES_SPEAKER,
  getValSpeaker,
  opcionesUnicas,
  propiedadFiltroColumna,
} from './speakerFiltros'

type SpeakersTableProps = { eventoId: string }

// Foto, URL foto, Nombre, Cargo, Empresa, País, Email, Teléfono, LinkedIn,
// Ciudad, Tipo Doc., Núm. Doc., Email secundario, Sesiones, Fuente, Toolkit,
// Acciones
const COLS_FIJAS = 17

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

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}

export function SpeakersTable({ eventoId }: SpeakersTableProps) {
  const { speakers, propiedades, valoresPorSpeaker, loading, error, refetch } =
    useSpeakersData(eventoId)
  const [busqueda, setBusqueda] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [modo, setModo] = useState<'create' | 'edit'>('create')
  const [activo, setActivo] = useState<Speaker | null>(null)
  const [propEditando, setPropEditando] = useState<PropiedadCustom | null>(null)
  const [speakerAEliminar, setSpeakerAEliminar] = useState<Speaker | null>(null)
  const [filtros, setFiltros] = useState<FiltroActivo[]>([])

  const filterColumns: FiltroColumna[] = useMemo(() => {
    const base: FiltroColumna[] = [
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
    ]
    const custom = propiedades
      .map(propiedadFiltroColumna)
      .filter((c): c is FiltroColumna => c !== null)
    return [...base, ...custom]
  }, [speakers, propiedades])

  // Overrides optimistas para edición inline (no se hace refetch por celda).
  // Campos base: key = speakerId. Propiedades custom: key = `${speakerId}:${propId}`.
  const [fieldOverrides, setFieldOverrides] = useState<
    Record<string, Partial<Record<CampoTexto, string>>>
  >({})
  const [valorOverrides, setValorOverrides] = useState<Record<string, unknown>>(
    {},
  )

  function campoActual(sp: Speaker, campo: CampoTexto): string {
    const ov = fieldOverrides[sp.id]?.[campo]
    if (ov !== undefined) return ov
    return toStr(sp[campo])
  }

  async function guardarCampo(sp: Speaker, campo: CampoTexto, valor: string) {
    const previo = toStr(sp[campo])
    setFieldOverrides((prev) => ({
      ...prev,
      [sp.id]: { ...prev[sp.id], [campo]: valor },
    }))
    try {
      await actualizarSpeaker(sp.id, { [campo]: valor } as Partial<SpeakerEditable>)
    } catch (err) {
      setFieldOverrides((prev) => ({
        ...prev,
        [sp.id]: { ...prev[sp.id], [campo]: previo },
      }))
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw err
    }
  }

  function valorActual(speakerId: string, propId: string): unknown {
    const key = `${speakerId}:${propId}`
    if (key in valorOverrides) return valorOverrides[key]
    return valoresPorSpeaker[speakerId]?.[propId]
  }

  async function guardarValor(
    speakerId: string,
    propId: string,
    valor: unknown,
  ) {
    const key = `${speakerId}:${propId}`
    const previo = valorActual(speakerId, propId)
    setValorOverrides((prev) => ({ ...prev, [key]: valor }))
    try {
      await guardarValorPropiedad(speakerId, propId, valor)
    } catch (err) {
      setValorOverrides((prev) => ({ ...prev, [key]: previo }))
      toast.error(
        `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`,
      )
      throw err
    }
  }

  const filtrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return speakers.filter((sp) => {
      if (
        term &&
        ![sp.nombre, sp.cargo, sp.empresa, sp.email]
          .filter(Boolean)
          .some((campo) => campo!.toLowerCase().includes(term))
      ) {
        return false
      }
      return filaPasaFiltros(
        (campo) => getValSpeaker(sp, campo, valoresPorSpeaker),
        filtros,
      )
    })
  }, [speakers, busqueda, filtros, valoresPorSpeaker])

  const totalCols = COLS_FIJAS + propiedades.length

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

  async function copiarToolkit(slug: string) {
    try {
      await navigator.clipboard.writeText(toolkitUrl(slug))
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
          <NuevaPropiedadDialog eventoId={eventoId} onCreada={refetch} />
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
                <TableHead>URL foto</TableHead>
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
                <TableHead>Toolkit</TableHead>
                {propiedades.map((prop) => (
                  <TableHead key={prop.id} className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {prop.nombre}
                      <button
                        type="button"
                        aria-label={`Editar propiedad ${prop.nombre}`}
                        onClick={() => setPropEditando(prop)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: totalCols }).map((__, c) => (
                      <TableCell key={c}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && filtrados.length === 0 && speakers.length > 0 && (
                <TableRow>
                  <TableCell
                    colSpan={totalCols}
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
                        <AvatarFallback>{iniciales(sp.nombre)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {sp.foto_url ? (
                        <a
                          href={sp.foto_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={sp.foto_url}
                          className="block truncate text-xs text-secondary hover:underline"
                        >
                          {sp.foto_url}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                        onSave={(v) => guardarCampo(sp, 'linkedin_url', v)}
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
                        onSave={(v) => guardarCampo(sp, 'tipo_documento', v)}
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
                      {sp.toolkit_slug ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Copiar link del toolkit de ${sp.nombre}`}
                          title="Copiar link del toolkit"
                          onClick={() => void copiarToolkit(sp.toolkit_slug!)}
                        >
                          <Link />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {propiedades.map((prop) => {
                      const v = valorActual(sp.id, prop.id)
                      return (
                        <TableCell
                          key={prop.id}
                          className="max-w-[160px] text-xs text-muted-foreground"
                        >
                          {prop.tipo === 'checkbox' ? (
                            <Checkbox
                              aria-label={prop.nombre}
                              checked={v === true || v === 'true'}
                              onCheckedChange={(checked) =>
                                void guardarValor(
                                  sp.id,
                                  prop.id,
                                  checked === true,
                                )
                              }
                            />
                          ) : prop.tipo === 'texto' ? (
                            <InlineText
                              value={toStr(v)}
                              onSave={(next) =>
                                guardarValor(sp.id, prop.id, next)
                              }
                            />
                          ) : prop.tipo === 'fecha' ? (
                            <Input
                              type="date"
                              value={toStr(v)}
                              onChange={(e) =>
                                void guardarValor(
                                  sp.id,
                                  prop.id,
                                  e.target.value,
                                )
                              }
                              className="h-7 text-xs"
                            />
                          ) : prop.tipo === 'select' ? (
                            <Select
                              value={toStr(v)}
                              onValueChange={(next) =>
                                void guardarValor(sp.id, prop.id, next)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {prop.opciones.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="truncate">
                              {resumenValor(prop, v)}
                            </span>
                          )}
                        </TableCell>
                      )
                    })}
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

      <EliminarSpeakerDialog
        speaker={speakerAEliminar}
        eventoId={eventoId}
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
        valoresDelSpeaker={activo ? valoresPorSpeaker[activo.id] : undefined}
      />

      <PropiedadEditarDialog
        propiedad={propEditando}
        onOpenChange={(open) => !open && setPropEditando(null)}
        onSaved={refetch}
      />
    </div>
  )
}
