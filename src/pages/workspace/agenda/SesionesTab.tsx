import { useState } from 'react'
import { cn } from '@/lib/utils'

const SUBVISTAS = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'kanban', label: 'Kanban' },
  { id: 'calendario', label: 'Calendario' },
] as const

type SubVista = (typeof SUBVISTAS)[number]['id']

export function SesionesTab() {
  const [subVista, setSubVista] = useState<SubVista>('tabla')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1">
        {SUBVISTAS.map((sv) => (
          <button
            key={sv.id}
            type="button"
            onClick={() => setSubVista(sv.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              subVista === sv.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {sv.label}
          </button>
        ))}
      </div>

      {subVista === 'tabla' && (
        <div>Vista tabla de sesiones — próximamente</div>
      )}
      {subVista === 'kanban' && (
        <div>Vista Kanban de sesiones — próximamente</div>
      )}
      {subVista === 'calendario' && (
        <div>Vista Calendario — próximamente</div>
      )}
    </div>
  )
}
