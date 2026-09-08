import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { LOGOS } from '@/assets/logos'
import { useAuth } from '@/contexts/AuthContext'

const ILUSTRACION_URL =
  'https://www.figma.com/api/mcp/asset/752bbeb5-7caf-44a3-a7f6-8bdd3123c11f.svg'

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
    } catch {
      setError('Correo o contraseña incorrectos')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#e9ebdf]">
      {/* Zona izquierda — 40% */}
      <div className="w-2/5 max-md:w-full shrink-0 bg-[#e9ebdf] pl-[166px] pt-[111px] pr-8 pb-16">
        <img
          src={LOGOS.black}
          alt="Colombiatech"
          className="h-[41px] w-auto"
        />

        <h1 className="mt-[80px] font-semibold text-[clamp(32px,3.5vw,48px)] leading-[1.05] text-[#040402]">
          Workspace para la
          <br />
          gestión de eventos.
        </h1>

        <form
          onSubmit={onSubmit}
          className="mt-[48px] flex w-[533px] max-w-full flex-col gap-4"
        >
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="h-[74px] w-full rounded-[24px] bg-white px-4 text-[24px] font-semibold text-[#868686] outline-none placeholder:text-[#868686]"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="h-[74px] w-full rounded-[24px] bg-white px-4 text-[24px] font-semibold text-[#868686] outline-none placeholder:text-[#868686]"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-[74px] w-full items-center justify-center gap-2 rounded-[24px] bg-[#040402] text-[24px] font-semibold text-white disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="size-6 animate-spin text-white" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>

      {/* Zona derecha — 60% (sin fondo propio, hereda el verde oliva) */}
      <div className="w-3/5 overflow-hidden max-md:hidden">
        <img
          src={ILUSTRACION_URL}
          alt=""
          className="h-full w-full object-cover object-left"
        />
      </div>
    </div>
  )
}
