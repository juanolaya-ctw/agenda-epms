import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ESTADO_ALTA_NUEVA,
  ESTADO_LABELS,
  EVENTO_SPEAKER_ESTADOS,
  type EventoSpeakerEstado,
} from '@/lib/eventoSpeakerEstado'
import {
  CAMPOS_DESTINO_LABELS,
  CAMPOS_DESTINO_OPTIONS,
  ImportParseError,
  autodetectarMapeo,
  bulkActualizarNombreEmpresa,
  construirPlan,
  enmascararEmail,
  filaPlanARpc,
  parseArchivo,
  resumirPlan,
  type AccionImport,
  type ArchivoParseado,
  type CampoDestino,
  type FilaPlan,
  type MapeoColumnas,
  type MembresiaExistente,
} from '@/lib/importSpeakers'
import { celdaValor } from '@/lib/importSpeakers/parse'
import {
  aplicarImportacion,
  cargarMembresiasEvento,
  cargarSpeakersParaMatch,
  sha256Hex,
  type AplicarImportError,
} from '@/hooks/useImportSpeakers'
import type { FilaRpc } from '@/lib/importSpeakers'

type Paso = 'archivo' | 'mapeo' | 'preview' | 'aplicar' | 'resultado'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null = solo directorio global (CRM). */
  eventoId: string | null
  eventoNombre: string
  /** En CRM: permite elegir evento. */
  eventosOpciones?: Array<{ id: string; nombre: string }>
  onDone?: () => void
}

const PAGE_SIZE = 25

type FiltroPreview =
  | 'todas'
  | 'revision'
  | 'avisos'
  | 'errores'
  | 'homonimos'

function MatchBadge({ nivel }: { nivel: string }) {
  const cls =
    nivel === 'alta'
      ? 'bg-status-approved/20 text-foreground border-status-approved/50'
      : nivel === 'media'
        ? 'bg-secondary/20 text-foreground border-secondary/50'
        : nivel === 'ambigua'
          ? 'bg-destructive/10 text-destructive border-destructive/40'
          : 'bg-muted text-muted-foreground'
  return (
    <Badge className={`border ${cls}`}>{nivel}</Badge>
  )
}

export function ImportSpeakersDialog({
  open,
  onOpenChange,
  eventoId: eventoIdProp,
  eventoNombre: eventoNombreProp,
  eventosOpciones,
  onDone,
}: Props) {
  const [paso, setPaso] = useState<Paso>('archivo')
  const [eventoId, setEventoId] = useState<string | null>(eventoIdProp)
  const [eventoNombre, setEventoNombre] = useState(eventoNombreProp)

  const [archivoNombre, setArchivoNombre] = useState('')
  const [archivoSha, setArchivoSha] = useState('')
  const [parsed, setParsed] = useState<ArchivoParseado | null>(null)
  const [hojaIdx, setHojaIdx] = useState(0)
  const [parseando, setParseando] = useState(false)

  const [mapeo, setMapeo] = useState<MapeoColumnas>({})
  const [estadoDefault, setEstadoDefault] =
    useState<EventoSpeakerEstado>(ESTADO_ALTA_NUEVA)

  const [membresias, setMembresias] = useState<MembresiaExistente[]>([])
  const [cargandoMatch, setCargandoMatch] = useState(false)
  const [filasPlan, setFilasPlan] = useState<FilaPlan[]>([])
  const [filtro, setFiltro] = useState<FiltroPreview>('todas')
  const [page, setPage] = useState(0)
  const [confirmText, setConfirmText] = useState('')
  const [sobrescribirEstadoGlobal, setSobrescribirEstadoGlobal] = useState(false)

  const [aplicando, setAplicando] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [resultado, setResultado] = useState<Record<string, number> | null>(
    null,
  )
  const [rpcFilasPendientes, setRpcFilasPendientes] = useState<FilaRpc[] | null>(
    null,
  )
  const [retryFrom, setRetryFrom] = useState(0)
  const [errorParcial, setErrorParcial] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPaso('archivo')
    setEventoId(eventoIdProp)
    setEventoNombre(eventoNombreProp)
    setArchivoNombre('')
    setArchivoSha('')
    setParsed(null)
    setHojaIdx(0)
    setMapeo({})
    setEstadoDefault(ESTADO_ALTA_NUEVA)
    setFilasPlan([])
    setFiltro('todas')
    setPage(0)
    setConfirmText('')
    setSobrescribirEstadoGlobal(false)
    setAplicando(false)
    setProgress({ done: 0, total: 0 })
    setResultado(null)
    setRpcFilasPendientes(null)
    setRetryFrom(0)
    setErrorParcial(null)
  }, [open, eventoIdProp, eventoNombreProp])

  const hoja = parsed?.hojas[hojaIdx] ?? null

  async function onFile(file: File | null) {
    if (!file) return
    setParseando(true)
    try {
      const buf = await file.arrayBuffer()
      const sha = await sha256Hex(buf)
      const arch = await parseArchivo({
        name: file.name,
        size: file.size,
        arrayBuffer: async () => buf,
      })
      setArchivoNombre(file.name)
      setArchivoSha(sha)
      setParsed(arch)
      setHojaIdx(arch.hojaActiva)
      const h = arch.hojas[arch.hojaActiva]!
      const sample = h.filas
        .slice(0, 40)
        .map((f) => f.celdas.map((c) => celdaValor(c)))
      setMapeo(autodetectarMapeo(h.headers, sample))
      toast.success(
        `Archivo leído: ${h.filas.length} filas en «${h.nombre}»`,
      )
    } catch (err) {
      const msg =
        err instanceof ImportParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      toast.error(msg)
    } finally {
      setParseando(false)
    }
  }

  function onChangeHoja(idx: number) {
    if (!parsed) return
    setHojaIdx(idx)
    const h = parsed.hojas[idx]!
    const sample = h.filas
      .slice(0, 40)
      .map((f) => f.celdas.map((c) => celdaValor(c)))
    setMapeo(autodetectarMapeo(h.headers, sample))
  }

  async function irAPreview() {
    if (!hoja) return
    if (!Object.values(mapeo).includes('nombre')) {
      toast.error('Mapeá al menos la columna Nombre.')
      return
    }
    setCargandoMatch(true)
    try {
      const [sp, memb] = await Promise.all([
        cargarSpeakersParaMatch(),
        eventoId ? cargarMembresiasEvento(eventoId) : Promise.resolve([]),
      ])
      setMembresias(memb)
      const plan = construirPlan(hoja.filas, mapeo, sp, memb, {
        estadoDefault,
        archivoNombre,
        hojaNombre: hoja.nombre,
      })
      let filas = plan.filas
      if (sobrescribirEstadoGlobal) {
        filas = filas.map((f) => ({ ...f, sobrescribirEstado: true }))
      }
      setFilasPlan(filas)
      setPaso('preview')
      setPage(0)
    } catch (err) {
      toast.error(
        `No se pudo cargar el pool: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setCargandoMatch(false)
    }
  }

  function rebuildPlan(next: FilaPlan[]) {
    setFilasPlan(next)
  }

  function setAccion(idx: number, accion: AccionImport) {
    rebuildPlan(
      filasPlan.map((fp, i) => {
        if (i !== idx) return fp
        return {
          ...fp,
          accion,
          speakerId:
            accion === 'actualizar'
              ? fp.speakerId ?? fp.match.candidatos[0]?.id ?? null
              : fp.speakerId,
        }
      }),
    )
  }

  function setCandidato(idx: number, speakerId: string) {
    rebuildPlan(
      filasPlan.map((fp, i) =>
        i === idx
          ? { ...fp, speakerId, accion: 'actualizar' as const }
          : fp,
      ),
    )
  }

  const resumen = useMemo(
    () =>
      resumirPlan(
        filasPlan,
        new Map(membresias.map((m) => [m.speaker_id, m])),
      ),
    [filasPlan, membresias],
  )

  const filtradas = useMemo(() => {
    return filasPlan
      .map((fp, i) => ({ fp, i }))
      .filter(({ fp }) => {
        if (filtro === 'revision') return fp.accion === 'revisar'
        if (filtro === 'avisos') return fp.fila.avisos.length > 0
        if (filtro === 'errores') return !!fp.fila.error
        if (filtro === 'homonimos') return fp.homonimoEnArchivo
        return true
      })
  }, [filasPlan, filtro])

  const pageItems = filtradas.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  )
  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))

  const quedanRevisar = filasPlan.some((f) => f.accion === 'revisar')
  const confirmTarget =
    eventoId == null ? 'DIRECTORIO' : eventoNombre.trim()
  const confirmOk =
    confirmText.trim().toLowerCase() === confirmTarget.toLowerCase()

  function descargarReporte() {
    const lines = [
      'fila,nombre,empresa,accion,match,motivo,avisos,error,homonimo,estado_hub',
    ]
    for (const fp of filasPlan) {
      const avisos = fp.fila.avisos.map((a) => a.codigo).join('|')
      lines.push(
        [
          fp.fila.filaIdx,
          csvEscape(fp.fila.nombre),
          csvEscape(fp.fila.empresa),
          fp.accion,
          fp.match.nivel,
          fp.match.motivo,
          csvEscape(avisos),
          csvEscape(fp.fila.error),
          fp.homonimoEnArchivo ? 'si' : 'no',
          fp.fila.estadoHub,
        ].join(','),
      )
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import-reporte-${archivoNombre || 'speakers'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function aplicar(opts?: { startFrom?: number }) {
    if (!hoja || quedanRevisar || !confirmOk) return
    setPaso('aplicar')
    setAplicando(true)
    setErrorParcial(null)
    let rpcFilas = rpcFilasPendientes
    if (!rpcFilas) {
      rpcFilas = filasPlan
        .map((fp) =>
          filaPlanARpc(fp, {
            estadoDefault,
            archivoNombre,
            hojaNombre: hoja.nombre,
          }),
        )
        .filter((x): x is NonNullable<typeof x> => x != null)
      setRpcFilasPendientes(rpcFilas)
    }
    try {
      const startFrom = opts?.startFrom ?? retryFrom
      const res = await aplicarImportacion({
        eventoId,
        archivoNombre,
        archivoSha256: archivoSha,
        hoja: hoja.nombre,
        mapeo: Object.fromEntries(
          Object.entries(mapeo).map(([k, v]) => [k, v]),
        ),
        filas: rpcFilas,
        startFrom,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResultado(res.resumen)
      setRetryFrom(0)
      setRpcFilasPendientes(null)
      setPaso('resultado')
      onDone?.()
      toast.success('Importación aplicada')
    } catch (err) {
      const e = err as AplicarImportError
      const msg = e instanceof Error ? e.message : String(err)
      const done = e.offsetDone ?? 0
      setRetryFrom(done)
      setErrorParcial(
        `Se detuvo tras ${done} de ${rpcFilas.length} filas RPC. ` +
          `Los chunks anteriores ya quedaron persistidos. Reintentar el resto ` +
          `crea un lote nuevo y es idempotente (no duplica gestiones ni speakers).`,
      )
      toast.error(`Importación detenida: ${msg}`)
      setPaso('preview')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Importar Excel/CSV
          </DialogTitle>
          <DialogDescription className="min-w-0 truncate">
            {eventoId
              ? `Evento: ${eventoNombre}`
              : 'Sin evento (solo directorio global)'}
            {' · '}
            Paso:{' '}
            {paso === 'archivo'
              ? '1. Archivo'
              : paso === 'mapeo'
                ? '2. Mapeo'
                : paso === 'preview'
                  ? '3. Vista previa'
                  : paso === 'aplicar'
                    ? '4. Aplicar'
                    : '5. Resultado'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {paso === 'archivo' && (
            <div className="flex flex-col gap-4">
              {eventosOpciones && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Destino
                  </label>
                  <Select
                    value={eventoId ?? '__dir__'}
                    onValueChange={(v) => {
                      if (v === '__dir__') {
                        setEventoId(null)
                        setEventoNombre('DIRECTORIO')
                        return
                      }
                      const ev = eventosOpciones.find((e) => e.id === v)
                      setEventoId(v)
                      setEventoNombre(ev?.nombre ?? v)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__dir__">
                        Sin evento (DIRECTORIO)
                      </SelectItem>
                      {eventosOpciones.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-muted/40">
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {parseando
                    ? 'Leyendo archivo…'
                    : 'Elegí un .xlsx o .csv (máx. 5 MB / 5.000 filas)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  El archivo no se sube a Storage; solo se procesa en el
                  navegador.
                </span>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv,text/csv"
                  className="hidden"
                  disabled={parseando}
                  onChange={(e) => {
                    void onFile(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </label>

              {parsed && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <p className="text-sm">
                    <span className="font-medium">{archivoNombre}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · SHA {archivoSha.slice(0, 12)}…
                    </span>
                  </p>
                  {parsed.hojas.length > 1 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-muted-foreground">
                        Hoja
                      </label>
                      <Select
                        value={String(hojaIdx)}
                        onValueChange={(v) => onChangeHoja(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {parsed.hojas.map((h, i) => (
                            <SelectItem key={h.nombre + i} value={String(i)}>
                              {h.nombre} ({h.filas.length} filas)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {hoja && (
                    <p className="text-xs text-muted-foreground">
                      {hoja.filas.length} filas · {hoja.headers.length}{' '}
                      columnas en «{hoja.nombre}»
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {paso === 'mapeo' && hoja && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">
                    Estado por defecto (si no hay columna Estado)
                  </label>
                  <Select
                    value={estadoDefault}
                    onValueChange={(v) =>
                      setEstadoDefault(v as EventoSpeakerEstado)
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENTO_SPEAKER_ESTADOS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {ESTADO_LABELS[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Columna archivo</TableHead>
                      <TableHead>Campo hub</TableHead>
                      <TableHead>Ejemplos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hoja.headers.map((h, colIdx) => {
                      const ejemplos = hoja.filas
                        .slice(0, 3)
                        .map((f) => {
                          const c = f.celdas[colIdx]
                          const v = c ? celdaValor(c) : null
                          return v == null || v === '' ? '—' : String(v)
                        })
                        .join(' · ')
                      return (
                        <TableRow key={colIdx}>
                          <TableCell className="min-w-0 max-w-[14rem] truncate font-medium">
                            {h || `(col ${colIdx + 1})`}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mapeo[colIdx] ?? 'ignorar'}
                              onValueChange={(v) =>
                                setMapeo((prev) => ({
                                  ...prev,
                                  [colIdx]: v as CampoDestino,
                                }))
                              }
                            >
                              <SelectTrigger className="w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CAMPOS_DESTINO_OPTIONS.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {CAMPOS_DESTINO_LABELS[c]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                            {ejemplos}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {paso === 'preview' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Crear {resumen.crear}</Badge>
                <Badge variant="outline">
                  Actualizar {resumen.actualizar}
                </Badge>
                <Badge variant="outline">Omitir {resumen.omitir}</Badge>
                <Badge variant="outline">Revisar {resumen.revisar}</Badge>
                <Badge variant="outline">Errores {resumen.errores}</Badge>
                <Badge variant="outline">
                  Homónimos {resumen.gruposHomonimos} grupos
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['todas', 'Todas'],
                    ['revision', 'Necesita revisión'],
                    ['avisos', 'Con avisos'],
                    ['errores', 'Errores'],
                    ['homonimos', 'Homónimos'],
                  ] as const
                ).map(([k, label]) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={filtro === k ? 'default' : 'outline'}
                    onClick={() => {
                      setFiltro(k)
                      setPage(0)
                    }}
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    rebuildPlan(bulkActualizarNombreEmpresa(filasPlan))
                  }
                >
                  Actualizar todos nombre+empresa exactos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    rebuildPlan(
                      filasPlan.map((fp) =>
                        fp.accion === 'revisar'
                          ? { ...fp, accion: 'omitir' as const }
                          : fp,
                      ),
                    )
                  }
                >
                  Omitir todas en revisión
                </Button>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={sobrescribirEstadoGlobal}
                    onChange={(e) => {
                      const on = e.target.checked
                      setSobrescribirEstadoGlobal(on)
                      rebuildPlan(
                        filasPlan.map((fp) => ({
                          ...fp,
                          sobrescribirEstado: on,
                        })),
                      )
                    }}
                  />
                  Sobrescribir estado del hub
                </label>
                <Button size="sm" variant="outline" onClick={descargarReporte}>
                  Descargar reporte CSV
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Org</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Avisos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map(({ fp, i }) => (
                      <TableRow key={fp.fila.filaIdx}>
                        <TableCell className="text-xs text-muted-foreground">
                          {fp.fila.filaIdx}
                          {fp.homonimoEnArchivo && (
                            <span className="ml-1 text-destructive">≈</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-0 max-w-[10rem] truncate text-sm">
                          {fp.fila.nombre ?? '—'}
                          {fp.fila.error && (
                            <p className="text-xs text-destructive">
                              {fp.fila.error}
                            </p>
                          )}
                          {fp.sinCambios && (
                            <p className="text-xs text-muted-foreground">
                              sin cambios
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[8rem] truncate text-xs">
                          {fp.fila.empresa ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">
                            {fp.fila.estadoRaw ?? '—'}
                          </span>
                          {' → '}
                          {ESTADO_LABELS[fp.fila.estadoHub]}
                        </TableCell>
                        <TableCell>
                          <MatchBadge nivel={fp.match.nivel} />
                          {fp.match.candidatos.length > 0 && (
                            <p className="mt-0.5 max-w-[10rem] truncate text-[10px] text-muted-foreground">
                              {fp.match.candidatos[0]!.nombre}
                              {fp.match.candidatos[0]!.email
                                ? ` · ${enmascararEmail(fp.match.candidatos[0]!.email)}`
                                : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Select
                              value={fp.accion}
                              onValueChange={(v) =>
                                setAccion(i, v as AccionImport)
                              }
                              disabled={!!fp.fila.error}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="crear">crear</SelectItem>
                                <SelectItem value="actualizar">
                                  actualizar
                                </SelectItem>
                                <SelectItem value="omitir">omitir</SelectItem>
                                <SelectItem value="revisar">revisar</SelectItem>
                              </SelectContent>
                            </Select>
                            {(fp.accion === 'actualizar' ||
                              fp.accion === 'revisar') &&
                              fp.match.candidatos.length > 1 && (
                                <Select
                                  value={fp.speakerId ?? ''}
                                  onValueChange={(v) => setCandidato(i, v)}
                                >
                                  <SelectTrigger className="h-8 w-40">
                                    <SelectValue placeholder="Candidato" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fp.match.candidatos.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.nombre}
                                        {c.empresa ? ` · ${c.empresa}` : ''}
                                        {c.email
                                          ? ` · ${enmascararEmail(c.email)}`
                                          : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[12rem] text-[10px] text-muted-foreground">
                          {fp.fila.avisos.map((a) => a.codigo).join(', ') ||
                            '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Página {page + 1}/{totalPages} · {filtradas.length} filas
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-border p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Para aplicar, escribí exactamente{' '}
                  <span className="font-semibold text-foreground">
                    {confirmTarget}
                  </span>
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmTarget}
                />
                {quedanRevisar && (
                  <p className="mt-2 text-xs text-destructive">
                    Todavía hay filas en «revisar». Resolvelas o omítelas
                    antes de aplicar.
                  </p>
                )}
                {errorParcial && (
                  <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <p>{errorParcial}</p>
                    {retryFrom > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={quedanRevisar || !confirmOk || aplicando}
                        onClick={() => void aplicar({ startFrom: retryFrom })}
                      >
                        Reintentar resto (desde {retryFrom})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {paso === 'aplicar' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm">
                Aplicando… {progress.done}/{progress.total}
              </p>
            </div>
          )}

          {paso === 'resultado' && resultado && (
            <div className="flex flex-col gap-2 py-4 text-sm">
              <p className="font-medium">Importación completada</p>
              <ul className="list-inside list-disc text-muted-foreground">
                <li>Creados: {resultado.creados ?? 0}</li>
                <li>Actualizados: {resultado.actualizados ?? 0}</li>
                <li>Omitidos: {resultado.omitidos ?? 0}</li>
                <li>Errores: {resultado.errores ?? 0}</li>
                <li>
                  Gestiones insertadas:{' '}
                  {resultado.gestiones_insertadas ?? 0}
                </li>
                <li>
                  Gestiones ya existentes:{' '}
                  {resultado.gestiones_existentes ?? 0}
                </li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={aplicando}
          >
            {paso === 'resultado' ? 'Cerrar' : 'Cancelar'}
          </Button>
          <div className="flex gap-2">
            {paso === 'archivo' && (
              <Button
                disabled={!parsed || parseando}
                onClick={() => setPaso('mapeo')}
              >
                Continuar al mapeo
              </Button>
            )}
            {paso === 'mapeo' && (
              <>
                <Button variant="outline" onClick={() => setPaso('archivo')}>
                  Atrás
                </Button>
                <Button
                  disabled={cargandoMatch}
                  onClick={() => void irAPreview()}
                >
                  {cargandoMatch ? (
                    <>
                      <Loader2 className="animate-spin" /> Calculando…
                    </>
                  ) : (
                    'Vista previa'
                  )}
                </Button>
              </>
            )}
            {paso === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setPaso('mapeo')}>
                  Atrás
                </Button>
                <Button
                  disabled={quedanRevisar || !confirmOk || aplicando}
                  onClick={() => void aplicar()}
                >
                  Aplicar importación
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function csvEscape(v: string | null | undefined): string {
  const s = v ?? ''
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
