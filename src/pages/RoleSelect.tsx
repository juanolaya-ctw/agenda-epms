import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useRole, type Role } from '@/contexts/RoleContext'
import { LOGOS } from '@/assets/logos'

type RoleOption = {
  role: Exclude<Role, null>
  label: string
  path: string
  variant: 'default' | 'secondary'
  description: string
}

const OPTIONS: RoleOption[] = [
  {
    role: 'agenda',
    label: 'Agenda',
    path: '/admin',
    variant: 'default',
    description: 'Gestión completa de la programación',
  },
  {
    role: 'sales',
    label: 'Sales',
    path: '/sales',
    variant: 'secondary',
    description: 'Explorar agenda y proponer speakers',
  },
  {
    role: 'cs',
    label: 'CS',
    path: '/cs',
    variant: 'secondary',
    description: 'Consultar speakers y reportar conflictos',
  },
]

export function RoleSelect() {
  const navigate = useNavigate()
  const { setRole } = useRole()

  function pick(option: RoleOption) {
    setRole(option.role)
    navigate(option.path)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-card p-8 text-card-foreground">
      <img src={LOGOS.black} alt="Colombiatech" className="h-10 w-auto" />

      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">
            Event Programming Management System
          </h1>
          <p className="font-light">Selecciona tu rol para continuar</p>
        </div>

        <div className="space-y-4">
          {OPTIONS.map((option) => (
            <div key={option.role} className="space-y-1">
              <Button
                variant={option.variant}
                className="h-12 w-full text-base font-semibold"
                onClick={() => pick(option)}
              >
                {option.label}
              </Button>
              <p className="text-center text-sm font-normal text-muted-foreground">
                {option.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
