import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useRole, type Role } from '@/contexts/RoleContext'
import { workspaceHomePath } from '@/lib/workspaceRoutes'

type RequireRoleProps = {
  allow: Exclude<Role, null> | 'any'
}

function readStoredRole(): Role {
  try {
    const raw = localStorage.getItem('epms_role')
    if (raw === 'agenda' || raw === 'sales' || raw === 'cs') return raw
  } catch {
    // no-op
  }
  return null
}

export function RequireRole({ allow }: RequireRoleProps) {
  const { role } = useRole()
  const location = useLocation()
  const effective = readStoredRole() ?? role

  if (!effective) return <Navigate to="/" replace />
  if (allow === 'any' || effective === allow) return <Outlet />

  const match = location.pathname.match(/^\/workspace\/([^/]+)/)
  if (match) {
    return <Navigate to={workspaceHomePath(match[1], effective)} replace />
  }

  return <Navigate to="/" replace />
}
