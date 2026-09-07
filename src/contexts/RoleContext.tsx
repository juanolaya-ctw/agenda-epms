import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

export type Role = 'agenda' | 'sales' | 'cs' | null

const STORAGE_KEY = 'epms_role'

type RoleContextValue = {
  role: Role
  setRole: (role: Role) => void
  clearRole: () => void
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined)

function readStoredRole(): Role {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'agenda' || raw === 'sales' || raw === 'cs') return raw
  } catch {
    // localStorage no disponible (modo privado, etc.) — se ignora.
  }
  return null
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readStoredRole)

  const setRole = useCallback((next: Role) => {
    setRoleState(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // no-op
    }
  }, [])

  const clearRole = useCallback(() => setRole(null), [setRole])

  return (
    <RoleContext.Provider value={{ role, setRole, clearRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole debe usarse dentro de <RoleProvider>')
  return ctx
}
