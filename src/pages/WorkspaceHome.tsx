import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/layout/Navbar'
import { WorkspaceCard } from '@/components/layout/WorkspaceCard'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export function WorkspaceHome() {
  const navigate = useNavigate()
  const { workspaces, addWorkspace } = useWorkspace()
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-secondary">
              Workspaces
            </p>
            <h1 className="text-3xl font-semibold">Tus eventos</h1>
            <p className="mt-1 font-light text-muted-foreground">
              Elige un evento para entrar a su programación, o crea un
              workspace nuevo.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate('/crm')}>
              Directorio de speakers
            </Button>
            <Button
              variant="default"
              onClick={() => setShowCreateModal(true)}
            >
              + Crear Evento Workspace
            </Button>
          </div>
        </div>

        <div
          className="mb-6 flex cursor-pointer items-center justify-between rounded-xl border border-border bg-white p-4 transition-colors hover:border-secondary"
          onClick={() => navigate('/crm')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') navigate('/crm')
          }}
          role="link"
          tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
              <Users className="size-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold">CRM de speakers</p>
              <p className="text-sm font-light text-muted-foreground">
                Directorio global: perfiles, eventos en los que participan y
                asignación a sesiones.
              </p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}

          <button
            type="button"
            className="flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border transition-colors hover:border-secondary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="mb-2 text-muted-foreground" size={24} />
            <p className="text-sm font-light text-muted-foreground">
              Crear Evento Workspace
            </p>
          </button>
        </div>
      </main>

      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(payload) => {
            addWorkspace(payload)
            setShowCreateModal(false)
          }}
        />
      )}
    </div>
  )
}

type CreatePayload = {
  nombre: string
  fechaInicio: string
  fechaFin: string
  coverUrl?: string
  escenarios: string[]
  formatos: string[]
  tracks: string[]
}

function CreateWorkspaceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (payload: CreatePayload) => void
}) {
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [coverUrl, setCoverUrl] = useState<string | undefined>()
  const [escenarios, setEscenarios] = useState<string[]>([])
  const [formatos, setFormatos] = useState<string[]>([])
  const [tracks, setTracks] = useState<string[]>([])

  function handleCover(file: File | undefined) {
    if (!file) {
      setCoverUrl(undefined)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setCoverUrl(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!nombre.trim() || !fechaInicio || !fechaFin) return
    onCreate({
      nombre: nombre.trim(),
      fechaInicio,
      fechaFin,
      coverUrl,
      escenarios,
      formatos,
      tracks,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-border bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-xl font-semibold">Crear Evento Workspace</h2>
        <div className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Nombre</span>
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Fecha inicio</span>
              <input
                required
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Fecha fin</span>
              <input
                required
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Cover</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleCover(e.target.files?.[0])}
              className="w-full text-sm"
            />
          </label>
          <EditableList
            label="Escenarios"
            items={escenarios}
            onChange={setEscenarios}
          />
          <EditableList
            label="Formatos"
            items={formatos}
            onChange={setFormatos}
          />
          <EditableList label="Tracks" items={tracks} onChange={setTracks} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Crear workspace</Button>
        </div>
      </form>
    </div>
  )
}

function EditableList({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-sm"
          >
            <span>{item}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={`Añadir ${label.toLowerCase()}`}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="button" variant="outline" onClick={add}>
          Añadir
        </Button>
      </div>
    </div>
  )
}
