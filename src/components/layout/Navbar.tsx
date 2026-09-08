import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Settings } from 'lucide-react'
import { useRole, type Role } from '@/contexts/RoleContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { workspaceHomePath } from '@/lib/workspaceRoutes'
import { cn } from '@/lib/utils'

const AREA = {
  agenda: { name: 'Agenda Ops', initials: 'TS' },
  sales: { name: 'Sales', initials: 'SA' },
  cs: { name: 'Customer Success', initials: 'CS' },
} as const

const ROLE_OPTIONS: { role: Exclude<Role, null>; label: string }[] = [
  { role: 'agenda', label: 'Equipo Agenda' },
  { role: 'sales', label: 'Sales' },
  { role: 'cs', label: 'Customer Success' },
]

function Dropdown({
  trigger,
  align = 'start',
  children,
}: {
  trigger: ReactNode
  align?: 'start' | 'center' | 'end'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[220px] rounded-lg border border-border bg-white py-1 shadow-md',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'end' && 'right-0',
            align === 'start' && 'left-0',
          )}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  )
}

export function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: routeWorkspaceId } = useParams()
  const { role, setRole } = useRole()
  const { workspaces, workspace, setWorkspace } = useWorkspace()

  const area = role ? AREA[role] : { name: 'EPMS', initials: 'EP' }
  const activeRoleLabel =
    ROLE_OPTIONS.find((o) => o.role === role)?.label ?? 'Seleccionar rol'

  function selectWorkspace(nextId: string) {
    const next = workspaces.find((w) => w.id === nextId)
    if (!next) return
    setWorkspace(next)
    if (routeWorkspaceId) {
      navigate(
        location.pathname.replace(
          `/workspace/${routeWorkspaceId}`,
          `/workspace/${next.id}`,
        ),
      )
    }
  }

  function switchRole(next: Exclude<Role, null>) {
    setRole(next)
    const id = workspace?.id ?? workspaces[0]?.id
    if (id) navigate(workspaceHomePath(id, next))
    else navigate('/home')
  }

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b border-border bg-white px-4">
      <Dropdown
        align="start"
        trigger={
          <button
            type="button"
            className="flex min-w-0 max-w-[320px] items-center gap-3 text-left"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-white">
              {area.initials}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold">{area.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {workspace?.nombre ?? 'Sin evento seleccionado'}
              </p>
            </div>
          </button>
        }
      >
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            className={cn(
              'block w-full px-3 py-2 text-left text-sm hover:bg-muted',
              ws.id === workspace?.id && 'font-semibold',
            )}
            onClick={() => selectWorkspace(ws.id)}
          >
            {ws.nombre}
          </button>
        ))}
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
          onClick={() => navigate('/home')}
        >
          Ver todos los eventos
        </button>
        {workspace && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                navigate(`/workspace/${workspace.id}/agenda/settings`)
              }
            >
              <Settings className="size-4 text-muted-foreground" />
              Configurar workspace
            </button>
          </>
        )}
      </Dropdown>

      <div className="flex-1" />

      <div className="flex flex-col items-end">
        <p className="text-xs text-muted-foreground">Ingresar como</p>
        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold"
            >
              {activeRoleLabel}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          }
        >
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.role}
              type="button"
              className={cn(
                'block w-full px-3 py-2 text-left text-sm hover:bg-muted',
                option.role === role && 'font-semibold',
              )}
              onClick={() => switchRole(option.role)}
            >
              {option.label}
            </button>
          ))}
        </Dropdown>
      </div>
    </header>
  )
}
