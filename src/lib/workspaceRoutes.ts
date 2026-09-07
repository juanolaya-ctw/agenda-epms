import type { Role } from '@/contexts/RoleContext'

export function workspaceHomePath(
  id: string,
  role: Exclude<Role, null>,
): string {
  if (role === 'sales') return `/workspace/${id}/sales`
  if (role === 'cs') return `/workspace/${id}/cs`
  return `/workspace/${id}/agenda`
}
