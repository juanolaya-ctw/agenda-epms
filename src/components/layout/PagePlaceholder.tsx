import { useRole } from '@/contexts/RoleContext'

type PagePlaceholderProps = {
  title: string
  description: string
}

const ROLE_LABEL: Record<string, string> = {
  agenda: 'Agenda',
  sales: 'Sales',
  cs: 'CS',
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  const { role } = useRole()

  return (
    <div className="space-y-4 p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {role && (
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            {ROLE_LABEL[role] ?? role}
          </span>
        )}
      </div>

      <p className="font-light text-muted-foreground">{description}</p>

      <div className="rounded-xl border border-border bg-card p-10 text-center text-card-foreground">
        <p className="text-sm font-normal text-muted-foreground">
          Sin contenido todavía — placeholder.
        </p>
      </div>
    </div>
  )
}
