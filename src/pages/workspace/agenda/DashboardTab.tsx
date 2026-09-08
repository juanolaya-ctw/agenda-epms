import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { DashboardData, DashboardKpiKey } from '@/hooks/useDashboardData'

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
  return (
    <div className="h-[116px] animate-pulse rounded-xl bg-muted" />
  )
}

function CoverBanner({ eventoId }: { eventoId: string | undefined }) {
  const { workspace, updateWorkspace } = useWorkspace()
  const [coverUrl, setCoverUrl] = useState<string | undefined>(
    workspace && workspace.id === eventoId ? workspace.coverUrl : undefined,
  )
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (workspace && workspace.id === eventoId) setCoverUrl(workspace.coverUrl)
  }, [workspace, eventoId])

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !eventoId) return

    const ext =
      file.name.split('.').pop()?.toLowerCase() ||
      file.type.split('/')[1] ||
      'jpg'
    const filename = `covers/evento-${eventoId}-${Date.now()}.${ext}`

    setSubiendo(true)
    try {
      const { error: uploadError } = await supabase.storage
        .from('speaker-fotos')
        .upload(filename, file, {
          contentType: file.type,
          upsert: true,
        })
      if (uploadError) throw new Error(uploadError.message)

      const { data } = supabase.storage
        .from('speaker-fotos')
        .getPublicUrl(filename)

      const { error: updateError } = await supabase
        .from('eventos')
        .update({ cover_url: data.publicUrl })
        .eq('id', eventoId)
      if (updateError) throw new Error(updateError.message)

      setCoverUrl(data.publicUrl)
      updateWorkspace(eventoId, { coverUrl: data.publicUrl })
      toast.success('Cover actualizado')
    } catch (err) {
      toast.error(
        `No se pudo cambiar el cover: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="group relative h-[200px] overflow-hidden">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className="size-full bg-gradient-to-r from-slate-800 to-slate-600" />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <button
        type="button"
        disabled={subiendo || !eventoId}
        onClick={() => fileInputRef.current?.click()}
        className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
      >
        <ImageIcon className="size-3.5" />
        {subiendo ? 'Subiendo…' : 'Cambiar cover'}
      </button>
    </div>
  )
}

export function DashboardTab() {
  const { id: eventoId } = useParams()
  const data = useOutletContext<DashboardData>()

  return (
    <div className="-mx-8 -mt-6">
      <CoverBanner eventoId={eventoId} />

      <div className="space-y-8 px-8 py-6">
        {data.loading ? (
          <div className="grid grid-cols-4 gap-4">
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
        ) : (
          <>
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
                <h2 className="text-lg font-semibold">
                  Sesiones con cupos abiertos
                </h2>
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
          </>
        )}
      </div>
    </div>
  )
}
