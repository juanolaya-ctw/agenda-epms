import { useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useDashboardData, type DashboardKpiKey } from '@/hooks/useDashboardData'

type Kpi = {
  key: DashboardKpiKey
  label: string
  accentWhenPositive?: boolean
}

const KPIS: Kpi[] = [
  {
    key: 'sesionesConCupo',
    label: 'Sesiones sin asignar completamente',
    accentWhenPositive: true,
  },
  { key: 'requestsPendientes', label: 'Requests pendientes' },
  { key: 'requestsEnRevision', label: 'En revisión' },
  { key: 'totalSesiones', label: 'Sesiones totales' },
]

function formatHora(hora: string): string {
  return hora.slice(0, 5) || '—'
}

function formatDia(dia: string): string {
  const parts = dia.split('-')
  if (parts.length < 3) return dia || '—'
  return `${parts[2]}/${parts[1]}`
}

function KpiCard({
  label,
  value,
  error,
  accentWhenPositive,
}: {
  label: string
  value: number
  error?: string
  accentWhenPositive?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : (
        <p
          className={cn(
            'mt-3 text-4xl font-semibold',
            accentWhenPositive && value > 0
              ? 'text-secondary'
              : 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
    </div>
  )
}

function KpiSkeleton() {
  return <div className="h-[116px] animate-pulse rounded-xl bg-muted" />
}

export function DashboardTab() {
  const { id } = useParams()
  const data = useDashboardData(id)

  if (data.loading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-4">
        {KPIS.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={data[kpi.key]}
            error={data.kpiErrors[kpi.key]}
            accentWhenPositive={kpi.accentWhenPositive}
          />
        ))}
      </div>

      {!data.kpiErrors.totalSesiones && data.totalSesiones === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No hay sesiones creadas aún para este evento.
        </p>
      )}

      {!data.kpiErrors.sesionesConCupo && data.sesionesConCupo > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sesiones con cupos abiertos</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-white">
            {data.sesionesAbiertas.map((sesion) => {
              const spots =
                sesion.capacidadSpeakers - sesion.speakersAsignados
              return (
                <li
                  key={sesion.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <p className="text-sm text-muted-foreground">
                    {formatHora(sesion.horaInicio)} · {formatDia(sesion.dia)}
                  </p>
                  <p className="font-semibold">{sesion.titulo}</p>
                  <p className="text-sm text-muted-foreground">
                    {sesion.escenarioNombre}
                  </p>
                  <span className="ml-auto rounded-full bg-secondary/15 px-2.5 py-0.5 text-xs font-semibold text-secondary">
                    {spots} spots disponibles
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
