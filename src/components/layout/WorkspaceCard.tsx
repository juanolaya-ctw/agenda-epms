import { CalendarDays } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '@/contexts/RoleContext'
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext'
import { workspaceHomePath } from '@/lib/workspaceRoutes'

function formatDateRange(inicio: string, fin: string): string {
  const start = new Date(`${inicio}T00:00:00`)
  const end = new Date(`${fin}T00:00:00`)
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

type WorkspaceCardProps = {
  workspace: Workspace
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const navigate = useNavigate()
  const { role } = useRole()
  const { workspace: active, setWorkspace } = useWorkspace()
  const isActive = active?.id === workspace.id

  function open() {
    setWorkspace(workspace)
    if (role) navigate(workspaceHomePath(workspace.id, role))
    else navigate(`/workspace/${workspace.id}/agenda`)
  }

  return (
    <button
      type="button"
      onClick={open}
      className="overflow-hidden rounded-xl border border-border bg-white text-left transition-shadow hover:shadow-md"
    >
      <div className="relative h-28">
        {workspace.coverUrl ? (
          <img
            src={workspace.coverUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-foreground via-foreground to-secondary" />
        )}
        {isActive && (
          <span className="absolute top-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
            Activo
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <p className="font-semibold">{workspace.nombre}</p>
        <p className="text-sm font-light text-muted-foreground">
          {formatDateRange(workspace.fechaInicio, workspace.fechaFin)}
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {workspace.sesiones ?? 0} sesiones
        </p>
      </div>
    </button>
  )
}
