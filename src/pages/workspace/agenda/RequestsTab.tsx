import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { invalidateRequestsPendientesCount } from '@/hooks/useDashboardData'
import {
  decidirRequest,
  useAgendaRequests,
  type AgendaRequest,
  type RequestEstado,
  type RequestTipo,
} from '@/hooks/useRequestsData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TIPO_LABEL: Record<RequestTipo, string> = {
  conflicto: 'Conflicto',
  ajuste: 'Ajuste',
  propuesta_speaker: 'Propuesta speaker',
}

const ESTADO_CLASS: Record<RequestEstado, string> = {
  PENDIENTE: 'border-transparent bg-yellow-100 text-yellow-900',
  EN_REVISION: 'border-transparent bg-blue-100 text-blue-900',
  APROBADO: 'border-transparent bg-green-100 text-green-900',
  RECHAZADO: 'border-transparent bg-red-100 text-red-900',
}

const AREA_CLASS: Record<'CS' | 'Sales', string> = {
  CS: 'border-transparent bg-violet-100 text-violet-900',
  Sales: 'border-transparent bg-sky-100 text-sky-900',
}

type AccionDialog =
  | { tipo: 'rechazar'; request: AgendaRequest }
  | { tipo: 'pedir_info'; request: AgendaRequest }
  | null

function formatFecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function estaAbierto(estado: RequestEstado): boolean {
  return estado === 'PENDIENTE' || estado === 'EN_REVISION'
}

function RequestCardSkeleton() {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="mt-3 h-4 w-2/3" />
      <Skeleton className="mt-2 h-16 w-full" />
      <Skeleton className="mt-3 h-3 w-40" />
    </div>
  )
}

function RequestCard({
  request,
  busyId,
  onAprobar,
  onRechazar,
  onPedirInfo,
}: {
  request: AgendaRequest
  busyId: string | null
  onAprobar: (r: AgendaRequest) => void
  onRechazar: (r: AgendaRequest) => void
  onPedirInfo: (r: AgendaRequest) => void
}) {
  const busy = busyId === request.id
  const abierto = estaAbierto(request.estado)

  return (
    <article className="rounded-lg border border-border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={AREA_CLASS[request.solicitante_area]}
        >
          {request.solicitante_area}
        </Badge>
        <Badge variant="secondary">
          {TIPO_LABEL[request.tipo] ?? request.tipo}
        </Badge>
        <Badge
          variant="outline"
          className={ESTADO_CLASS[request.estado] ?? ''}
        >
          {request.estado.replace('_', ' ')}
        </Badge>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {request.sesionTitulo && (
          <p>
            <span className="font-medium">Sesión:</span> {request.sesionTitulo}
          </p>
        )}
        {request.speakerNombre && (
          <p>
            <span className="font-medium">Speaker:</span>{' '}
            {request.speakerNombre}
            {request.speakerEmpresa ? ` · ${request.speakerEmpresa}` : ''}
          </p>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
        {request.motivo}
      </p>

      {request.respuesta_agenda && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Tu respuesta anterior:
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {request.respuesta_agenda}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {request.solicitanteNombre ?? 'Solicitante'}
          {' · '}
          {formatFecha(request.created_at)}
        </p>

        {abierto && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onPedirInfo(request)}
            >
              Pedir más info
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => onRechazar(request)}
            >
              Rechazar
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAprobar(request)}
            >
              {busy ? 'Guardando…' : 'Aprobar'}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

export function RequestsTab() {
  const { usuario } = useAuth()
  const { requests, loading, error, refetch } = useAgendaRequests()
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroArea, setFiltroArea] = useState<string>('todas')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<AccionDialog>(null)
  const [dialogTexto, setDialogTexto] = useState('')
  const [dialogSaving, setDialogSaving] = useState(false)

  const filtrados = useMemo(() => {
    return requests.filter((r) => {
      if (filtroEstado !== 'todos' && r.estado !== filtroEstado) return false
      if (filtroArea !== 'todas' && r.solicitante_area !== filtroArea)
        return false
      return true
    })
  }, [requests, filtroEstado, filtroArea])

  async function aplicarDecision(
    request: AgendaRequest,
    estado: Extract<RequestEstado, 'APROBADO' | 'RECHAZADO' | 'EN_REVISION'>,
    respuesta: string,
    toastMsg: string,
  ) {
    if (!usuario) {
      toast.error('No hay sesión activa.')
      return
    }
    setBusyId(request.id)
    const { error: updError } = await decidirRequest({
      id: request.id,
      estado,
      respuesta_agenda: respuesta,
      decidido_por: usuario.id,
    })
    setBusyId(null)

    if (updError) {
      toast.error(`No se pudo actualizar: ${updError}`)
      return
    }

    toast.success(toastMsg)
    invalidateRequestsPendientesCount()
    await refetch()
  }

  async function handleAprobar(request: AgendaRequest) {
    await aplicarDecision(request, 'APROBADO', 'Aprobado', 'Request aprobado')
  }

  function openDialog(next: AccionDialog) {
    setDialog(next)
    setDialogTexto('')
    setDialogSaving(false)
  }

  async function confirmarDialog() {
    if (!dialog) return
    const texto = dialogTexto.trim()
    if (!texto) {
      toast.error(
        dialog.tipo === 'rechazar'
          ? 'Indica el motivo del rechazo.'
          : 'Indica qué información necesitas.',
      )
      return
    }

    setDialogSaving(true)
    if (dialog.tipo === 'rechazar') {
      await aplicarDecision(
        dialog.request,
        'RECHAZADO',
        texto,
        'Request rechazado',
      )
    } else {
      await aplicarDecision(
        dialog.request,
        'EN_REVISION',
        texto,
        'Solicitud de información enviada',
      )
    }
    setDialogSaving(false)
    setDialog(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="PENDIENTE">PENDIENTE</SelectItem>
            <SelectItem value="EN_REVISION">EN REVISION</SelectItem>
            <SelectItem value="APROBADO">APROBADO</SelectItem>
            <SelectItem value="RECHAZADO">RECHAZADO</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroArea} onValueChange={setFiltroArea}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las áreas</SelectItem>
            <SelectItem value="CS">CS</SelectItem>
            <SelectItem value="Sales">Sales</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <RequestCardSkeleton />
          <RequestCardSkeleton />
          <RequestCardSkeleton />
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay solicitudes pendientes.
          </p>
        </div>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="flex flex-col gap-3">
          {filtrados.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              busyId={busyId}
              onAprobar={(r) => void handleAprobar(r)}
              onRechazar={(r) => openDialog({ tipo: 'rechazar', request: r })}
              onPedirInfo={(r) => openDialog({ tipo: 'pedir_info', request: r })}
            />
          ))}
        </div>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !dialogSaving) setDialog(null)
        }}
      >
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle>
              {dialog?.tipo === 'rechazar'
                ? 'Rechazar request'
                : 'Pedir más información'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.tipo === 'rechazar'
                ? 'El solicitante verá este motivo en su historial.'
                : 'El request pasará a EN REVISION con tu pregunta.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-accion-texto">
              {dialog?.tipo === 'rechazar'
                ? 'Motivo del rechazo'
                : '¿Qué información necesitas?'}
            </Label>
            <Textarea
              id="request-accion-texto"
              value={dialogTexto}
              onChange={(e) => setDialogTexto(e.target.value)}
              rows={4}
              autoFocus
              placeholder={
                dialog?.tipo === 'rechazar'
                  ? 'Explica por qué se rechaza…'
                  : 'Escribe qué datos faltan…'
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={dialogSaving}
              onClick={() => setDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={dialog?.tipo === 'rechazar' ? 'destructive' : 'default'}
              disabled={dialogSaving}
              onClick={() => void confirmarDialog()}
            >
              {dialogSaving ? 'Guardando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
