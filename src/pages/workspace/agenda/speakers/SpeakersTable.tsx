import { useMemo, useState } from 'react'
import { Eye, Flag, Link, Pencil, Trash2, UserPlus } from 'lucide-react'
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
import { ReportarRequestDialog } from '@/components/requests/ReportarRequestDialog'
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
import { ColumnOrderPopover } from './ColumnOrderPopover'
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
import {
  SPEAKERS_ACCIONES_ID,
  SPEAKERS_FIXED_COLUMNS,
  defaultSpeakersColumnOrder,
  loadColumnOrder,
  mergeColumnOrder,
  propiedadIdFromColumn,
  saveColumnOrder,
} from './speakersColumnOrder'
import { cn } from '@/lib/utils'

type SpeakersTableProps = {
  eventoId: string
  /** Vista CS / Sales: sin edición ni administración de propiedades. */
  readOnly?: boolean
}

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

/** Ancho fijo + overflow: max-w solo no basta en tablas con whitespace-nowrap. */
const CELL_URL = 'w-[160px] max-w-[160px] overflow-hidden'
const CELL_EMAIL = 'w-[180px] max-w-[180px] overflow-hidden'

function Truncated({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const text = value || '—'
  return (
    <span
      className={cn('block min-w-0 truncate', className)}
      title={value || undefined}
    >
      {text}
    </span>
  )
}

function headClassName(columnId: string): string | undefined {
  if (columnId === 'foto') return 'w-12'
  if (columnId === 'linkedin' || columnId === 'foto_url') return CELL_URL
  if (columnId === 'email' || columnId === 'email_secundario') return CELL_EMAIL
  if (columnId === SPEAKERS_ACCIONES_ID) return 'text-right'
  return undefined
}

export function SpeakersTable({
  eventoId,
  readOnly = false,
}: SpeakersTableProps) {
  const { speakers, propiedades, valoresPorSpeaker, loading, error, refetch } =
    useSpeakersData(eventoId)
  const [busqueda, setBusqueda] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [modo, setModo] = useState<'create' | 'edit'>('create')
  const [activo, setActivo] = useState<Speaker | null>(null)
  const [propEditando, setPropEditando] = useState<PropiedadCustom | null>(null)
  const [speakerAEliminar, setSpeakerAEliminar] = useState<Speaker | null>(null)
  const [speakerAReportar, setSpeakerAReportar] = useState<Speaker | null>(null)
  const [filtros, setFiltros] = useState<FiltroActivo[]>([])
  const [storedOrder, setStoredOrder] = useState<string[] | null>(
    () => loadColumnOrder(),
  )

  const defaultOrder = useMemo(
    () => defaultSpeakersColumnOrder(propiedades.map((p) => p.id)),
    [propiedades],
  )
  const columnIds = useMemo(
    () => mergeColumnOrder(storedOrder, defaultOrder),
    [storedOrder, defaultOrder],
  )

  const columnasPanel = useMemo(() => {
    const labels = new Map<string, string>(
      SPEAKERS_FIXED_COLUMNS.map((c) => [c.id, c.label]),
    )
    labels.set(SPEAKERS_ACCIONES_ID, 'Acciones')
    for (const prop of propiedades) {
      labels.set(`prop:${prop.id}`, prop.nombre)
    }
    return columnIds.map((id) => ({
      id,
      label: labels.get(id) ?? id,
    }))
  }, [columnIds, propiedades])

  function persistColumnOrder(ids: string[]) {
    setStoredOrder(ids)
    saveColumnOrder(ids)
  }

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

  const totalCols = columnIds.length

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

  function renderHead(columnId: string) {
    const propId = propiedadIdFromColumn(columnId)
    if (propId) {
      const prop = propiedades.find((p) => p.id === propId)
      if (!prop) return null
      return (
        <TableHead key={columnId} className="whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {prop.nombre}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Editar propiedad ${prop.nombre}`}
                onClick={() => setPropEditando(prop)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
            )}
          </span>
        </TableHead>
      )
    }

    const fixed = SPEAKERS_FIXED_COLUMNS.find((c) => c.id === columnId)
    const label =
      columnId === SPEAKERS_ACCIONES_ID ? 'Acciones' : (fixed?.label ?? columnId)
    return (
      <TableHead key={columnId} className={headClassName(columnId)}>
        {label}
      </TableHead>
    )
  }

  function renderCell(columnId: string, sp: Speaker) {
    const propId = propiedadIdFromColumn(columnId)
    if (propId) {
      const prop = propiedades.find((p) => p.id === propId)
      if (!prop) return <TableCell key={columnId} />
      const v = valorActual(sp.id, prop.id)
      return (
        <TableCell
          key={columnId}
          className="w-[160px] max-w-[160px] overflow-hidden text-xs text-muted-foreground"
        >
          {prop.tipo === 'checkbox' ? (
            <Checkbox
              aria-label={prop.nombre}
              checked={v === true || v === 'true'}
              disabled={readOnly}
              onCheckedChange={
                readOnly
                  ? undefined
                  : (checked) => void guardarValor(sp.id, prop.id, checked === true)
              }
            />
          ) : prop.tipo === 'texto' ? (
            readOnly ? (
              <Truncated value={toStr(v)} />
            ) : (
              <div className="min-w-0 max-w-[160px]">
                <InlineText
                  value={toStr(v)}
                  onSave={(next) => guardarValor(sp.id, prop.id, next)}
                />
              </div>
            )
          ) : prop.tipo === 'fecha' ? (
            readOnly ? (
              <Truncated value={toStr(v)} />
            ) : (
              <Input
                type="date"
                value={toStr(v)}
                onChange={(e) => void guardarValor(sp.id, prop.id, e.target.value)}
                className="h-7 text-xs"
              />
            )
          ) : prop.tipo === 'select' ? (
            readOnly ? (
              <Truncated value={toStr(v)} />
            ) : (
              <Select
                value={toStr(v)}
                onValueChange={(next) => void guardarValor(sp.id, prop.id, next)}
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
            )
          ) : (
            <Truncated value={resumenValor(prop, v)} />
          )}
        </TableCell>
      )
    }

    switch (columnId) {
      case 'foto':
        return (
          <TableCell key={columnId}>
            <button
              type="button"
              className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => abrirEditar(sp)}
              aria-label={`Abrir perfil de ${sp.nombre}`}
              title="Abrir perfil"
            >
              <Avatar size="sm">
                {sp.foto_url && (
                  <AvatarImage src={sp.foto_url} alt={sp.nombre} />
                )}
                <AvatarFallback>{iniciales(sp.nombre)}</AvatarFallback>
              </Avatar>
            </button>
          </TableCell>
        )
      case 'foto_url':
        return (
          <TableCell key={columnId} className={CELL_URL}>
            {sp.foto_url ? (
              <a
                href={sp.foto_url}
                target="_blank"
                rel="noopener noreferrer"
                title={sp.foto_url}
                className="block min-w-0 truncate text-xs text-secondary hover:underline"
              >
                {sp.foto_url}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        )
      case 'nombre':
        return (
          <TableCell key={columnId} className="max-w-[200px]">
            {readOnly ? (
              <button
                type="button"
                onClick={() => abrirEditar(sp)}
                className="block max-w-full truncate text-left font-semibold hover:underline"
                title={campoActual(sp, 'nombre') || undefined}
              >
                {campoActual(sp, 'nombre') || 'Sin nombre'}
              </button>
            ) : (
              <div className="min-w-0 max-w-[200px]">
                <InlineText
                  value={campoActual(sp, 'nombre')}
                  placeholder="Sin nombre"
                  displayClassName="font-semibold"
                  onSave={(v) => guardarCampo(sp, 'nombre', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'cargo':
        return (
          <TableCell
            key={columnId}
            className="max-w-[160px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'cargo')} />
            ) : (
              <div className="min-w-0 max-w-[160px]">
                <InlineText
                  value={campoActual(sp, 'cargo')}
                  onSave={(v) => guardarCampo(sp, 'cargo', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'empresa':
        return (
          <TableCell
            key={columnId}
            className="max-w-[160px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'empresa')} />
            ) : (
              <div className="min-w-0 max-w-[160px]">
                <InlineText
                  value={campoActual(sp, 'empresa')}
                  onSave={(v) => guardarCampo(sp, 'empresa', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'pais':
        return (
          <TableCell key={columnId} className="max-w-[120px] overflow-hidden">
            {readOnly ? (
              <Truncated value={campoActual(sp, 'pais')} />
            ) : (
              <div className="min-w-0 max-w-[120px]">
                <InlineText
                  value={campoActual(sp, 'pais')}
                  onSave={(v) => guardarCampo(sp, 'pais', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'email':
        return (
          <TableCell
            key={columnId}
            className={cn(CELL_EMAIL, 'text-muted-foreground')}
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'email')} />
            ) : (
              <div className="min-w-0 max-w-[180px]">
                <InlineText
                  value={campoActual(sp, 'email')}
                  validate={(v) => EMAIL_RE.test(v)}
                  onSave={(v) => guardarCampo(sp, 'email', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'telefono':
        return (
          <TableCell
            key={columnId}
            className="max-w-[120px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'telefono')} />
            ) : (
              <div className="min-w-0 max-w-[120px]">
                <InlineText
                  value={campoActual(sp, 'telefono')}
                  onSave={(v) => guardarCampo(sp, 'telefono', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'linkedin':
        return (
          <TableCell
            key={columnId}
            className={cn(CELL_URL, 'text-muted-foreground')}
          >
            {readOnly ? (
              <Truncated
                value={campoActual(sp, 'linkedin_url')}
                className="text-secondary"
              />
            ) : (
              <div className="min-w-0 max-w-[160px]">
                <InlineText
                  value={campoActual(sp, 'linkedin_url')}
                  displayClassName="truncate text-secondary"
                  onSave={(v) => guardarCampo(sp, 'linkedin_url', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'ciudad':
        return (
          <TableCell
            key={columnId}
            className="max-w-[120px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'ciudad')} />
            ) : (
              <div className="min-w-0 max-w-[120px]">
                <InlineText
                  value={campoActual(sp, 'ciudad')}
                  onSave={(v) => guardarCampo(sp, 'ciudad', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'tipo_documento':
        return (
          <TableCell
            key={columnId}
            className="max-w-[100px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'tipo_documento')} />
            ) : (
              <div className="min-w-0 max-w-[100px]">
                <InlineText
                  value={campoActual(sp, 'tipo_documento')}
                  onSave={(v) => guardarCampo(sp, 'tipo_documento', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'numero_documento':
        return (
          <TableCell
            key={columnId}
            className="max-w-[120px] overflow-hidden text-muted-foreground"
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'numero_documento')} />
            ) : (
              <div className="min-w-0 max-w-[120px]">
                <InlineText
                  value={campoActual(sp, 'numero_documento')}
                  onSave={(v) => guardarCampo(sp, 'numero_documento', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'email_secundario':
        return (
          <TableCell
            key={columnId}
            className={cn(CELL_EMAIL, 'text-muted-foreground')}
          >
            {readOnly ? (
              <Truncated value={campoActual(sp, 'email_secundario')} />
            ) : (
              <div className="min-w-0 max-w-[180px]">
                <InlineText
                  value={campoActual(sp, 'email_secundario')}
                  validate={emailOpcional}
                  onSave={(v) => guardarCampo(sp, 'email_secundario', v)}
                />
              </div>
            )}
          </TableCell>
        )
      case 'sesiones':
        return (
          <TableCell key={columnId}>
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
        )
      case 'fuente':
        return (
          <TableCell key={columnId}>
            <FuenteBadge fuente={sp.fuente} />
          </TableCell>
        )
      case 'toolkit':
        return (
          <TableCell key={columnId}>
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
        )
      case SPEAKERS_ACCIONES_ID:
        return (
          <TableCell key={columnId} className="text-right">
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  readOnly
                    ? `Ver perfil de ${sp.nombre}`
                    : `Editar ${sp.nombre}`
                }
                onClick={() => abrirEditar(sp)}
              >
                {readOnly ? <Eye /> : <Pencil />}
              </Button>
              {readOnly ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Reportar sobre ${sp.nombre}`}
                  title="Reportar al equipo de Agenda"
                  onClick={() => setSpeakerAReportar(sp)}
                >
                  <Flag />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Eliminar ${sp.nombre}`}
                  onClick={() => setSpeakerAEliminar(sp)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </TableCell>
        )
      default:
        return <TableCell key={columnId} />
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
          <ColumnOrderPopover
            columns={columnasPanel}
            onReorder={persistColumnOrder}
          />
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <NuevaPropiedadDialog eventoId={eventoId} onCreada={refetch} />
              <Button onClick={abrirCrear}>
                <UserPlus /> Agregar speaker
              </Button>
            </>
          )}
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
              <TableRow>{columnIds.map((id) => renderHead(id))}</TableRow>
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
                    {columnIds.map((id) => renderCell(id, sp))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!readOnly && (
        <EliminarSpeakerDialog
          speaker={speakerAEliminar}
          eventoId={eventoId}
          onOpenChange={(open) => !open && setSpeakerAEliminar(null)}
          onDeleted={refetch}
        />
      )}

      <SpeakerPerfilDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={modo}
        speaker={activo}
        eventoId={eventoId}
        onSaved={refetch}
        readOnly={readOnly}
        propiedadesEvento={propiedades}
        valoresDelSpeaker={activo ? valoresPorSpeaker[activo.id] : undefined}
      />

      {!readOnly && (
        <PropiedadEditarDialog
          propiedad={propEditando}
          onOpenChange={(open) => !open && setPropEditando(null)}
          onSaved={refetch}
        />
      )}

      {readOnly && (
        <ReportarRequestDialog
          open={speakerAReportar !== null}
          onOpenChange={(open) => !open && setSpeakerAReportar(null)}
          title={`Reportar sobre ${speakerAReportar?.nombre ?? 'speaker'}`}
          origen="speaker"
          speakerId={speakerAReportar?.id}
          successToast="Reporte enviado al equipo de Agenda"
        />
      )}
    </div>
  )
}
