import { useRole } from '@/contexts/RoleContext'
import { cn } from '@/lib/utils'

type TabPlaceholderProps = {
  title: string
  description: string
}

const ROLE_LABEL = {
  agenda: 'Agenda',
  sales: 'Sales',
  cs: 'Customer Success',
} as const

export function TabPlaceholder({ title, description }: TabPlaceholderProps) {
  const { role } = useRole()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {role && (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              role === 'agenda'
                ? 'bg-foreground text-card'
                : 'bg-secondary text-secondary-foreground',
            )}
          >
            {ROLE_LABEL[role]}
          </span>
        )}
      </div>
      <p className="font-light text-muted-foreground">{description}</p>
    </div>
  )
}
