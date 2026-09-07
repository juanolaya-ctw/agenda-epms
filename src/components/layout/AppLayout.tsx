import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useRole, type Role } from '@/contexts/RoleContext'
import { LOGOS } from '@/assets/logos'

type NavItem = { label: string; to: string; end?: boolean }

const NAV: Record<Exclude<Role, null>, NavItem[]> = {
  agenda: [
    { label: 'Resumen', to: '/admin', end: true },
    { label: 'Sesiones', to: '/admin/sesiones' },
    { label: 'Speakers', to: '/admin/speakers' },
    { label: 'Solicitudes', to: '/admin/requests' },
    { label: 'Directorio CRM', to: '/crm' },
  ],
  sales: [
    { label: 'Explorar agenda', to: '/sales', end: true },
    { label: 'Mis solicitudes', to: '/sales/requests' },
  ],
  cs: [
    { label: 'Buscar speakers', to: '/cs', end: true },
    { label: 'Mis solicitudes', to: '/cs/requests' },
  ],
}

type AppLayoutProps = { role: Exclude<Role, null> }

export function AppLayout({ role }: AppLayoutProps) {
  const { role: activeRole, clearRole } = useRole()
  const navigate = useNavigate()

  // Protección mínima (sin Auth real): el rol del contexto debe
  // coincidir con el que la ruta declara. Si no, volver al selector.
  if (activeRole !== role) {
    return <Navigate to="/" replace />
  }

  function changeRole() {
    clearRole()
    navigate('/')
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="p-4">
          <img
            src={LOGOS.black}
            alt="Colombiatech"
            className="h-7 w-auto invert"
          />
        </div>

        <div className="px-4 pb-4">
          <label
            htmlFor="workspace-select"
            className="mb-1 block text-xs font-normal uppercase tracking-wide opacity-70"
          >
            Workspace
          </label>
          <select
            id="workspace-select"
            defaultValue="govtech-2026"
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1.5 text-sm font-normal text-sidebar-foreground"
          >
            <option value="govtech-2026">GovTech Summit 2026</option>
          </select>
        </div>

        <nav className="flex-1 space-y-1 overflow-auto px-2">
          {NAV[role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-2 text-sm font-semibold',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={changeRole}
            className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Cambiar rol
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
