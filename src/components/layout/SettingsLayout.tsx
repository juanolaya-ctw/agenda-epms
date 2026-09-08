import { useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export function SettingsLayout() {
  const { id } = useParams()
  const { workspaces, workspace, setWorkspace } = useWorkspace()
  const found = workspaces.find((w) => w.id === id)

  useEffect(() => {
    if (found && workspace?.id !== found.id) setWorkspace(found)
  }, [found, workspace, setWorkspace])

  if (!id || !found) return <Navigate to="/home" replace />

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-2xl px-8 py-10">
        <Outlet />
      </main>
    </div>
  )
}
