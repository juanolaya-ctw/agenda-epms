import { useAuth } from '@/contexts/AuthContext'
import {
  useMisRequests,
  type RequestEstado,
  type RequestTipo,
  type SolicitudRequest,
} from '@/hooks/useRequestsData'
import { Badge } from '@/components/ui/badge'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

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

function formatFecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function MotivoCell({ request }: { request: SolicitudRequest }) {
  return (
    <div className="min-w-0 max-w-md">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="truncate text-sm">{request.motivo}</p>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm whitespace-pre-wrap">
            {request.motivo}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {request.respuesta_agenda && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Agenda: {request.respuesta_agenda}
        </p>
      )}
    </div>
  )
}

export function SolicitudesTab() {
  const { usuario } = useAuth()
  const { requests, loading, error } = useMisRequests(usuario?.id)

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    )
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((__, c) => (
                  <TableCell key={c}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        No has enviado solicitudes aún.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((req) => (
            <TableRow key={req.id}>
              <TableCell>
                <Badge variant="secondary">
                  {TIPO_LABEL[req.tipo] ?? req.tipo}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[220px] text-sm">
                {req.sesionTitulo && (
                  <p className="truncate font-medium">{req.sesionTitulo}</p>
                )}
                {req.speakerNombre && (
                  <p
                    className={cn(
                      'truncate',
                      req.sesionTitulo
                        ? 'text-xs text-muted-foreground'
                        : 'font-medium',
                    )}
                  >
                    {req.speakerNombre}
                  </p>
                )}
                {!req.sesionTitulo && !req.speakerNombre && (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <MotivoCell request={req} />
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={ESTADO_CLASS[req.estado] ?? ''}
                >
                  {req.estado.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatFecha(req.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
