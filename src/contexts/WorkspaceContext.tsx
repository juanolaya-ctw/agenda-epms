import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'

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

// La fuente de verdad de los eventos es epms.eventos (ver loadEventos abajo).
// Esta lista solo se usa como estado inicial síncrono mientras llega la
// respuesta de Supabase, o si Supabase no responde.
const FALLBACK_WORKSPACES: Workspace[] = [
  {
    id: GOVTECH_EVENT_ID,
    nombre: 'GovTech Summit | 2026',
    fechaInicio: '2026-08-13',
    fechaFin: '2026-08-14',
  },
]

type EventoRow = {
  id: string
  nombre: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  cover_url: string | null
}

function mapEvento(row: EventoRow): Workspace {
  const ws: Workspace = {
    id: row.id,
    nombre: row.nombre ?? '',
    fechaInicio: row.fecha_inicio ?? '',
    fechaFin: row.fecha_fin ?? '',
  }
  if (row.cover_url) ws.coverUrl = row.cover_url
  return ws
}

async function loadEventos(): Promise<Workspace[] | null> {
  const { data, error } = await supabase
    .from('eventos')
    .select('id, nombre, fecha_inicio, fecha_fin, cover_url, activo')
    .order('created_at', { ascending: false })
  if (error || !data) return null
  return (data as EventoRow[]).map(mapEvento)
}

type WorkspaceContextValue = {
  workspaces: Workspace[]
  workspace: Workspace | null
  setWorkspace: (workspace: Workspace | null) => void
  addWorkspace: (input: Omit<Workspace, 'id'> & { id?: string }) => Workspace
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void
  removeWorkspace: (id: string) => void
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
    if (!raw) return FALLBACK_WORKSPACES
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return FALLBACK_WORKSPACES
    return migrateWorkspaces(parsed as Workspace[])
  } catch {
    return FALLBACK_WORKSPACES
  }
}

function readStoredActiveId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return migrateWorkspaceId(raw)
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
  const [activeId, setActiveId] = useState<string | null>(readStoredActiveId)

  const persistList = useCallback((next: Workspace[]) => {
    try {
      localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // no-op
    }
  }, [])

  // Fuente de verdad: epms.eventos. Al montar, reemplaza la lista local con
  // los eventos reales (incluye cover_url), conservando cualquier workspace
  // creado solo en el cliente que aún no exista en Supabase.
  useEffect(() => {
    let cancelled = false
    loadEventos().then((remotos) => {
      if (cancelled || !remotos) return
      setWorkspaces((prev) => {
        const locales = new Map(prev.map((w) => [w.id, w]))
        const merged = remotos.map((remoto) => {
          const local = locales.get(remoto.id)
          locales.delete(remoto.id)
          return local ? { ...local, ...remoto } : remoto
        })
        const soloLocales = [...locales.values()]
        const next = [...merged, ...soloLocales]
        persistList(next)
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [persistList])

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

  const updateWorkspace = useCallback(
    (id: string, patch: Partial<Workspace>) => {
      setWorkspaces((prev) => {
        const next = prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
        persistList(next)
        return next
      })
    },
    [persistList],
  )

  const removeWorkspace = useCallback(
    (id: string) => {
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id)
        persistList(next)
        return next
      })
      setActiveId((current) => {
        if (current !== id) return current
        persistActive(null)
        return null
      })
    },
    [persistActive, persistList],
  )

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  )

  const value = useMemo(
    () => ({
      workspaces,
      workspace,
      setWorkspace,
      addWorkspace,
      updateWorkspace,
      removeWorkspace,
    }),
    [
      workspaces,
      workspace,
      setWorkspace,
      addWorkspace,
      updateWorkspace,
      removeWorkspace,
    ],
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
