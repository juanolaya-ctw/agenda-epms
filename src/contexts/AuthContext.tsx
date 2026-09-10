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
  if (error) {
    // Error real de red o RLS: es un fallo distinto de "no existe la fila".
    // No debe interpretarse como "usuario no registrado".
    console.error('[fetchUsuario] error real:', error)
    throw error
  }
  return (data as Usuario) ?? null
}

// signIn() maneja el evento SIGNED_IN de forma explícita. Mientras está en
// curso, el callback de onAuthStateChange no debe disparar su propio
// fetchUsuario en paralelo: una lectura fallida ahí haría signOut() sobre la
// sesión que signIn() acaba de abrir.
let signInEnProgreso = false

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
      let u: Usuario | null
      try {
        u = await fetchUsuario(userId)
      } catch {
        // Error transitorio de red/RLS: no cierres la sesión aquí. Deja que un
        // evento posterior (o el propio signIn) lo resuelva.
        return
      }
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // signIn() ya se está encargando de este SIGNED_IN de forma explícita;
      // no dupliques el trabajo ni compitas con su fetchUsuario.
      if (event === 'SIGNED_IN' && signInEnProgreso) return
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
    signInEnProgreso = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw new Error(error.message)
      if (!data.user) throw new Error('No se pudo autenticar.')

      // Confirma que el cliente ya tiene la sesión aplicada antes de consultar
      // el perfil: fetchUsuario pasa por RLS (id = auth.uid()) y necesita el
      // JWT nuevo en la request de PostgREST.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        throw new Error(
          'La sesión no se estableció correctamente. Intenta de nuevo.',
        )
      }

      let usuario: Usuario | null
      try {
        usuario = await fetchUsuario(data.user.id)
      } catch {
        // Error real de red/RLS: no cierres la sesión, permite reintentar.
        throw new Error(
          'No se pudo verificar tu acceso. Intenta de nuevo en un momento.',
        )
      }

      if (!usuario) {
        await supabase.auth.signOut()
        throw new Error('Tu cuenta no tiene acceso al sistema.')
      }

      setUsuario(usuario)
    } finally {
      signInEnProgreso = false
    }
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
