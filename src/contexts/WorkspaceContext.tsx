import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Workspace = {
  id: string
  nombre: string
  fechaInicio: string
  fechaFin: string
  coverUrl?: string
  escenarios?: string[]
  formatos?: string[]
  tracks?: string[]
}

const STORAGE_KEY = 'epms_workspace'
const LIST_STORAGE_KEY = 'epms_workspaces'

const GOVTECH_EVENT_ID = '2f042639-cc2d-4c06-bea3-f8316a3419c1'
const LEGACY_GOVTECH_ID = 'govtech-2026'

const MOCK_WORKSPACES: Workspace[] = [
  {
    id: GOVTECH_EVENT_ID,
    nombre: 'GovTech Summit | 2026',
    fechaInicio: '2026-08-13',
    fechaFin: '2026-08-14',
  },
  {
    id: 'ai-summit-2027',
    nombre: 'AI Summit 2027',
    fechaInicio: '2027-05-07',
    fechaFin: '2027-05-08',
  },
]

type WorkspaceContextValue = {
  workspaces: Workspace[]
  workspace: Workspace | null
  setWorkspace: (workspace: Workspace | null) => void
  addWorkspace: (input: Omit<Workspace, 'id'> & { id?: string }) => Workspace
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
)

function migrateWorkspaceId(id: string): string {
  return id === LEGACY_GOVTECH_ID ? GOVTECH_EVENT_ID : id
}

function migrateWorkspaces(list: Workspace[]): Workspace[] {
  return list.map((workspace) => ({
    ...workspace,
    id: migrateWorkspaceId(workspace.id),
  }))
}

function readStoredList(): Workspace[] {
  try {
    const raw = localStorage.getItem(LIST_STORAGE_KEY)
    if (!raw) return MOCK_WORKSPACES
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return MOCK_WORKSPACES
    return migrateWorkspaces(parsed as Workspace[])
  } catch {
    return MOCK_WORKSPACES
  }
}

function readStoredActiveId(list: Workspace[]): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const id = migrateWorkspaceId(raw)
    if (list.some((w) => w.id === id)) return id
  } catch {
    // localStorage no disponible
  }
  return null
}

function slugify(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `evento-${Date.now()}`
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(readStoredList)
  const [activeId, setActiveId] = useState<string | null>(() =>
    readStoredActiveId(readStoredList()),
  )

  const persistList = useCallback((next: Workspace[]) => {
    try {
      localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // no-op
    }
  }, [])

  const persistActive = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // no-op
    }
  }, [])

  const setWorkspace = useCallback(
    (next: Workspace | null) => {
      setActiveId(next?.id ?? null)
      persistActive(next?.id ?? null)
    },
    [persistActive],
  )

  const addWorkspace = useCallback(
    (input: Omit<Workspace, 'id'> & { id?: string }) => {
      const base = input.id ?? slugify(input.nombre)
      const id = workspaces.some((w) => w.id === base)
        ? `${base}-${Date.now()}`
        : base
      const created: Workspace = {
        ...input,
        id,
      }
      setWorkspaces((prev) => {
        const next = [...prev, created]
        persistList(next)
        return next
      })
      persistActive(id)
      setActiveId(id)
      return created
    },
    [persistActive, persistList, workspaces],
  )

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  )

  const value = useMemo(
    () => ({ workspaces, workspace, setWorkspace, addWorkspace }),
    [workspaces, workspace, setWorkspace, addWorkspace],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace debe usarse dentro de <WorkspaceProvider>')
  }
  return ctx
}
