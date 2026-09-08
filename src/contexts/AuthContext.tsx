import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { Area } from '@/lib/workspaceRoutes'

export type Usuario = {
  id: string
  nombre: string
  email: string
  area: Area
  rol: 'admin' | 'colaborador'
}

type AuthState = {
  usuario: Usuario | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

async function fetchUsuario(userId: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, area, rol')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as Usuario
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function resolveSession(userId: string | undefined) {
      if (!userId) {
        if (!cancelled) setUsuario(null)
        return
      }
      const u = await fetchUsuario(userId)
      if (cancelled) return
      if (u) {
        setUsuario(u)
      } else {
        // Hay sesión de auth pero la persona no está en epms.usuarios.
        await supabase.auth.signOut()
        setUsuario(null)
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await resolveSession(session?.user?.id)
      if (!cancelled) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // No await directo aquí: llamar a supabase dentro del callback mientras
      // el lock de auth está tomado puede bloquear el cliente. Se difiere.
      const userId = session?.user?.id
      setTimeout(() => {
        if (!cancelled) void resolveSession(userId)
      }, 0)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw new Error(error.message)

    const u = data.user ? await fetchUsuario(data.user.id) : null
    if (!u) {
      await supabase.auth.signOut()
      throw new Error('El usuario no está registrado en el sistema.')
    }
    setUsuario(u)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUsuario(null)
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
