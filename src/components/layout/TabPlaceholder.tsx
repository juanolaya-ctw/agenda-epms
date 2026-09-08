import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type TabPlaceholderProps = {
  title: string
  description: string
}

export function TabPlaceholder({ title, description }: TabPlaceholderProps) {
  const { usuario } = useAuth()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {usuario && (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              usuario.area === 'Agenda'
                ? 'bg-foreground text-card'
                : 'bg-secondary text-secondary-foreground',
            )}
          >
            {usuario.area}
          </span>
        )}
      </div>
      <p className="font-light text-muted-foreground">{description}</p>
    </div>
  )
}
