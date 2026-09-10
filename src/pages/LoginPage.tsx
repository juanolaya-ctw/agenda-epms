import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LOGOS } from '@/assets/logos'
import loginIllustration from '@/assets/login/login-illustration.png'
import { useAuth } from '@/contexts/AuthContext'

// Ilustración (patrón de rombos) exportada desde Figma y guardada como asset
// local para no depender de la URL temporal de Figma (que expira a ~7 días).
// Nodo Figma: f4e716f0-c324-43ca-8d18-cf834df5c835

export function LoginPage() {
  const { usuario, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (usuario) return <Navigate to="/home" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
      navigate('/home')
    } catch (e) {
      console.error('[login] error real:', e)
      const mensaje =
        e instanceof Error ? e.message : 'Correo o contraseña incorrectos'
      setError(mensaje)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#e9ebdf]">
      {/* Columna izquierda — formulario */}
      <div className="flex w-full flex-col justify-center px-8 md:w-[45%] md:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-xl">
          <img
            src={LOGOS.black}
            alt="Colombiatech"
            className="h-auto"
            style={{ width: 'clamp(150px, 45%, 280px)' }}
          />

          <div className="mt-10 space-y-8 md:mt-12 md:space-y-12">
            <h1 className="text-3xl font-semibold leading-tight text-[#040402] md:text-4xl lg:text-5xl">
              Workspace para la gestión de eventos.
            </h1>

            <form onSubmit={onSubmit} className="space-y-4">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="h-14 w-full rounded-3xl bg-white px-6 text-base font-medium text-[#040402] outline-none placeholder:text-[#868686] md:h-16 md:text-lg"
              />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="h-14 w-full rounded-3xl bg-white px-6 text-base font-medium text-[#040402] outline-none placeholder:text-[#868686] md:h-16 md:text-lg"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-3xl bg-[#040402] text-base font-semibold text-white disabled:opacity-60 md:h-16 md:text-lg"
              >
                {submitting ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Columna derecha — ilustración (oculta en mobile) */}
      <div className="relative hidden overflow-hidden md:block md:w-[55%]">
        <img
          src={loginIllustration}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
    </div>
  )
}
