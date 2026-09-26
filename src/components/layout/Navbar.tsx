import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import {
  eventSettingsPath,
  workspaceHomePath,
  type ViewRole,
} from '@/lib/workspaceRoutes'
import { cn } from '@/lib/utils'

const ROLE_OPTIONS: { role: ViewRole; label: string }[] = [
  { role: 'agenda', label: 'Equipo Agenda' },
  { role: 'sales', label: 'Sales' },
  { role: 'cs', label: 'Customer Success' },
]

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'EP'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

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
  const { usuario, signOut } = useAuth()
  const { workspaces, workspace, setWorkspace } = useWorkspace()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [busquedaEvento, setBusquedaEvento] = useState('')

  const nombre = usuario?.nombre ?? 'EPMS'
  const initials = usuario ? iniciales(usuario.nombre) : 'EP'
  const areaName = usuario?.area ?? 'EPMS'
  const isAdmin = usuario?.rol === 'admin'

  const currentView = ((): ViewRole | undefined => {
    const match = location.pathname.match(
      /\/workspace\/[^/]+\/(agenda|sales|cs)/,
    )?.[1] as ViewRole | undefined
    if (match) return match
    // Settings del evento es una vista de Agenda, fuera del prefijo /agenda.
    if (/\/workspace\/[^/]+\/settings(?:\/|$)/.test(location.pathname)) {
      return 'agenda'
    }
    return undefined
  })()
  const activeRoleLabel =
    ROLE_OPTIONS.find((o) => o.role === currentView)?.label ?? 'Seleccionar vista'

  // Nombre y destino salen del evento de la URL actual; si no hay :id
  // (home/CRM), se usa el evento activo del contexto.
  const eventoActivo =
    workspaces.find((w) => w.id === routeWorkspaceId) ?? workspace

  const enWorkspace = location.pathname.startsWith('/workspace/')
  const enCrm = location.pathname === '/crm' || location.pathname.startsWith('/crm/')
  const mostrarVolverHome = enWorkspace || enCrm

  const eventosFiltrados = useMemo(() => {
    const term = busquedaEvento.trim().toLowerCase()
    if (!term) return workspaces
    return workspaces.filter((ws) => ws.nombre.toLowerCase().includes(term))
  }, [workspaces, busquedaEvento])

  function selectWorkspace(nextId: string) {
    const next = workspaces.find((w) => w.id === nextId)
    if (!next) return
    setWorkspace(next)
    setSwitcherOpen(false)
    setBusquedaEvento('')
    if (routeWorkspaceId) {
      navigate(
        location.pathname.replace(
          `/workspace/${routeWorkspaceId}`,
          `/workspace/${next.id}`,
        ),
      )
    } else if (enCrm) {
      // En CRM el cambio de contexto no navega; solo actualiza el evento activo.
      return
    } else {
      navigate(workspaceHomePath(next.id, currentView ?? 'agenda'))
    }
  }

  function switchView(next: ViewRole) {
    const id = eventoActivo?.id ?? workspaces[0]?.id
    if (id) navigate(workspaceHomePath(id, next))
    else navigate('/home')
  }

  async function handleSignOut() {
    setSwitcherOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b border-border bg-white px-4">
      {mostrarVolverHome && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Volver al Home"
                onClick={() => navigate('/home')}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Volver al Home</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Popover
        open={switcherOpen}
        onOpenChange={(open) => {
          setSwitcherOpen(open)
          if (!open) setBusquedaEvento('')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Cambiar de evento"
            className="flex min-w-0 max-w-[360px] items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{nombre}</p>
              <p className="truncate text-xs text-muted-foreground">
                {areaName} · {eventoActivo?.nombre ?? 'Sin evento'}
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[280px] overflow-hidden p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Input
              value={busquedaEvento}
              onChange={(e) => setBusquedaEvento(e.target.value)}
              placeholder="Buscar evento…"
              className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              autoFocus
            />
            <kbd className="pointer-events-none hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {eventosFiltrados.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Sin eventos
              </p>
            ) : (
              eventosFiltrados.map((ws) => {
                const activo = ws.id === eventoActivo?.id
                return (
                  <button
                    key={ws.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                      activo && 'bg-muted',
                    )}
                    onClick={() => selectWorkspace(ws.id)}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-foreground text-[9px] font-semibold text-white">
                      {iniciales(ws.nombre)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ws.nombre}</span>
                    {activo && (
                      <Check className="size-4 shrink-0 text-foreground" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                setSwitcherOpen(false)
                navigate('/home', { state: { openCreate: true } })
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              Crear Evento Workspace
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
              onClick={() => {
                setSwitcherOpen(false)
                navigate('/home')
              }}
            >
              Ver todos los eventos
            </button>
            {enWorkspace && eventoActivo && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setSwitcherOpen(false)
                  navigate(eventSettingsPath(eventoActivo.id))
                }}
              >
                <Settings className="size-4 text-muted-foreground" />
                Configurar evento
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-muted"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1" />

      {isAdmin && (
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
                  option.role === currentView && 'font-semibold',
                )}
                onClick={() => switchView(option.role)}
              >
                {option.label}
              </button>
            ))}
          </Dropdown>
        </div>
      )}
    </header>
  )
}
