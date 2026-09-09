import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { WorkspaceCoverBanner } from '@/components/layout/WorkspaceCoverBanner'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useRequestsPendientesCount } from '@/hooks/useDashboardData'
import { cn } from '@/lib/utils'
import type { ViewRole } from '@/lib/workspaceRoutes'

type TabItem = {
  label: string
  to: string
  end?: boolean
  count?: number
}

const VIEW: Record<
  ViewRole,
  { title: string; description: string; label: string }
> = {
  agenda: {
    label: 'AGENDA',
    title: 'Panel de programación',
    description:
      'Todo el estado crudo de la agenda: cupos, asignaciones y solicitudes entrantes. Solo desde aquí se modifica la programación real.',
  },
  sales: {
    label: 'SALES',
    title: 'Explorador de agenda',
    description:
      'Consulta la programación completa y propón speakers donde haya cupo. Las propuestas las revisa el equipo de Agenda.',
  },
  cs: {
    label: 'CUSTOMER SUCCESS',
    title: 'Speakers e itinerarios',
    description:
      'Consulta dónde está cada speaker y reporta conflictos de horario o ajustes. El equipo de Agenda resuelve.',
  },
}

function tabsFor(id: string, role: ViewRole, requestCount: number): TabItem[] {
  if (role === 'agenda') {
    return [
      { label: 'Dashboard', to: `/workspace/${id}/agenda`, end: true },
      { label: 'Sesiones', to: `/workspace/${id}/agenda/sesiones` },
      { label: 'Speakers', to: `/workspace/${id}/agenda/speakers` },
      {
        label: 'Requests',
        to: `/workspace/${id}/agenda/requests`,
        count: requestCount,
      },
    ]
  }
  if (role === 'sales') {
    return [
      { label: 'Agenda', to: `/workspace/${id}/sales`, end: true },
      { label: 'Calendario', to: `/workspace/${id}/sales/calendario` },
      { label: 'Mis solicitudes', to: `/workspace/${id}/sales/solicitudes` },
    ]
  }
  return [
    { label: 'Buscador de speakers', to: `/workspace/${id}/cs`, end: true },
    { label: 'Calendario', to: `/workspace/${id}/cs/calendario` },
    { label: 'Mis solicitudes', to: `/workspace/${id}/cs/solicitudes` },
  ]
}

type WorkspaceLayoutProps = {
  role: ViewRole
}

export function WorkspaceLayout({ role }: WorkspaceLayoutProps) {
  const { id } = useParams()
  const { workspaces, workspace, setWorkspace } = useWorkspace()
  const requestCount = useRequestsPendientesCount(role === 'agenda' ? id : null)

  const found = workspaces.find((w) => w.id === id)

  useEffect(() => {
    if (found && workspace?.id !== found.id) setWorkspace(found)
  }, [found, workspace, setWorkspace])

  if (!id || !found) return <Navigate to="/home" replace />

  const view = VIEW[role]

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {role === 'agenda' && <WorkspaceCoverBanner eventoId={id} />}

      <div
        className="border-b border-border px-8 py-6"
        style={{
          backgroundColor: '#F5F0E8',
          backgroundImage:
            'radial-gradient(circle, #d4c9b0 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-secondary">
          VISTA {view.label} · {found.nombre}
        </p>
        <h1 className="text-3xl font-semibold">{view.title}</h1>
        <p className="mt-1 font-light text-muted-foreground">
          {view.description}
        </p>
      </div>

      <div className="border-b border-border px-8">
        <nav className="flex gap-1">
          {tabsFor(id, role, requestCount).map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 px-4 py-3 text-sm no-underline',
                  isActive
                    ? 'border-b-2 border-foreground bg-white font-semibold text-foreground'
                    : 'border-b-2 border-transparent text-muted-foreground',
                )
              }
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="rounded-full bg-status-pending px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                  {tab.count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-auto px-8 py-6">
        <Outlet />
      </main>
    </div>
  )
}
