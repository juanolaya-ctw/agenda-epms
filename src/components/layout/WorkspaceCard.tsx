import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useRole } from '@/contexts/RoleContext'
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext'
import { workspaceHomePath } from '@/lib/workspaceRoutes'
import { supabase } from '@/lib/supabase'

function formatDateRange(inicio: string, fin: string): string {
  const start = new Date(`${inicio}T00:00:00`)
  const end = new Date(`${fin}T00:00:00`)
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer'))
    reader.readAsDataURL(file)
  })
}

type WorkspaceCardProps = {
  workspace: Workspace
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const navigate = useNavigate()
  const { role } = useRole()
  const { workspace: active, setWorkspace } = useWorkspace()
  const isActive = active?.id === workspace.id

  const [coverUrl, setCoverUrl] = useState<string | undefined>(
    workspace.coverUrl,
  )
  const [subiendo, setSubiendo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function open() {
    setWorkspace(workspace)
    if (role) navigate(workspaceHomePath(workspace.id, role))
    else navigate(`/workspace/${workspace.id}/agenda`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSubiendo(true)
    try {
      const base64 = await readAsDataUrl(file)
      const { error } = await supabase
        .from('eventos')
        .update({ cover_url: base64 })
        .eq('id', workspace.id)
      if (error) throw new Error(error.message)
      setCoverUrl(base64)
      toast.success('Cover actualizado')
    } catch (err) {
      toast.error(
        `No se pudo cambiar el cover: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-white text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="relative h-28">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-foreground via-foreground to-secondary" />
        )}
        {isActive && (
          <span className="absolute top-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
            Activo
          </span>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          disabled={subiendo}
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
        >
          <ImageIcon className="size-3.5" />
          {subiendo ? 'Subiendo…' : 'Cambiar cover'}
        </button>
      </div>
      <div className="space-y-2 p-4">
        <p className="font-semibold">{workspace.nombre}</p>
        <p className="text-sm font-light text-muted-foreground">
          {formatDateRange(workspace.fechaInicio, workspace.fechaFin)}
        </p>
      </div>
    </div>
  )
}
