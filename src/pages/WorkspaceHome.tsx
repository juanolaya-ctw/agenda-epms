import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/layout/Navbar'
import { WorkspaceCard } from '@/components/layout/WorkspaceCard'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { createEventoWorkspace } from '@/lib/createEventoWorkspace'
import { workspaceHomePath, areaToRoute } from '@/lib/workspaceRoutes'

const ESTADOS_POR_DEFECTO = ['BORRADOR', 'CONFIRMADA']

function primerNombre(nombreCompleto: string): string {
  const primero = nombreCompleto.trim().split(/\s+/).filter(Boolean)[0]
  return primero || 'equipo'
}

export function WorkspaceHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario } = useAuth()
  const { workspaces, addWorkspace, setWorkspace } = useWorkspace()
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    const state = location.state as { openCreate?: boolean } | null
    if (state?.openCreate) {
      setShowCreateModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  const saludo = `Hola, ${primerNombre(usuario?.nombre ?? '')}.`

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[36px] font-semibold leading-tight tracking-tight">
              {saludo}
            </h1>
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
          onCreate={async (payload) => {
            try {
              const created = await createEventoWorkspace(payload)
              const workspace = addWorkspace({
                id: created.id,
                nombre: created.nombre,
                fechaInicio: created.fechaInicio,
                fechaFin: created.fechaFin,
                coverUrl: created.coverUrl,
                escenarios: payload.escenarios,
                formatos: payload.formatos,
                tracks: payload.tracks,
                estados: payload.estados,
              })
              setWorkspace(workspace)
              setShowCreateModal(false)
              toast.success(`Evento «${created.nombre}» creado`)
              const view =
                usuario && usuario.rol !== 'admin'
                  ? areaToRoute(usuario.area)
                  : 'agenda'
              navigate(workspaceHomePath(created.id, view))
            } catch (err) {
              toast.error(
                `No se pudo crear el evento: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              )
              throw err
            }
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
  coverFile?: File
  escenarios: string[]
  formatos: string[]
  tracks: string[]
  estados: string[]
}

function CreateWorkspaceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (payload: CreatePayload) => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [coverFile, setCoverFile] = useState<File | undefined>()
  const [escenarios, setEscenarios] = useState<string[]>([])
  const [formatos, setFormatos] = useState<string[]>([])
  const [tracks, setTracks] = useState<string[]>([])
  const [estados, setEstados] = useState<string[]>(ESTADOS_POR_DEFECTO)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!nombre.trim() || !fechaInicio || !fechaFin || saving) return
    setSaving(true)
    try {
      await onCreate({
        nombre: nombre.trim(),
        fechaInicio,
        fechaFin,
        coverFile,
        escenarios,
        formatos,
        tracks,
        estados: estados.map((e) => e.trim()).filter(Boolean),
      })
    } catch {
      // El caller ya mostró toast; el modal permanece abierto.
    } finally {
      setSaving(false)
    }
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
              disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Cover</span>
            <input
              type="file"
              accept="image/*"
              disabled={saving}
              onChange={(e) => setCoverFile(e.target.files?.[0])}
              className="w-full text-sm"
            />
          </label>
          <EditableList
            label="Escenarios"
            items={escenarios}
            onChange={setEscenarios}
            disabled={saving}
          />
          <EditableList
            label="Formatos"
            items={formatos}
            onChange={setFormatos}
            disabled={saving}
          />
          <EditableList
            label="Tracks"
            items={tracks}
            onChange={setTracks}
            disabled={saving}
          />
          <EditableList
            label="Estados de sesión"
            items={estados}
            onChange={setEstados}
            disabled={saving}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear workspace'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function EditableList({
  label,
  items,
  onChange,
  disabled,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value || disabled) return
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
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
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
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={`Añadir ${label.toLowerCase()}`}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={disabled}
        >
          Añadir
        </Button>
      </div>
    </div>
  )
}
