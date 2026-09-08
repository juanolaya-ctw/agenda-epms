export type ViewRole = 'agenda' | 'sales' | 'cs'

export type Area = 'Agenda' | 'Sales' | 'CS'

export function areaToRoute(area: Area): ViewRole {
  if (area === 'Sales') return 'sales'
  if (area === 'CS') return 'cs'
  return 'agenda'
}

export function workspaceHomePath(id: string, role: ViewRole): string {
  if (role === 'sales') return `/workspace/${id}/sales`
  if (role === 'cs') return `/workspace/${id}/cs`
  return `/workspace/${id}/agenda`
}
