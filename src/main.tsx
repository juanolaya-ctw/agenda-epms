import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { Toaster } from '@/components/ui/sonner'
import { LoginPage } from '@/pages/LoginPage'
import { WorkspaceHome } from '@/pages/WorkspaceHome'
import { NotFound } from '@/pages/NotFound'
import type { Area } from '@/lib/workspaceRoutes'

// Rutas cargadas bajo demanda: agenda es la vista primaria pero igual se
// separa del bundle inicial; Sales/CS/CRM/Settings solo se descargan si el
// usuario entra a ellas.
const WorkspaceLayout = lazy(() =>
  import('@/components/layout/WorkspaceLayout').then((m) => ({
    default: m.WorkspaceLayout,
  })),
)
const SettingsLayout = lazy(() =>
  import('@/components/layout/SettingsLayout').then((m) => ({
    default: m.SettingsLayout,
  })),
)
const CrmGlobal = lazy(() =>
  import('@/pages/CrmGlobal').then((m) => ({ default: m.CrmGlobal })),
)
const DashboardTab = lazy(() =>
  import('@/pages/workspace/agenda/DashboardTab').then((m) => ({
    default: m.DashboardTab,
  })),
)
const SesionesTab = lazy(() =>
  import('@/pages/workspace/agenda/SesionesTab').then((m) => ({
    default: m.SesionesTab,
  })),
)
const SpeakersTab = lazy(() =>
  import('@/pages/workspace/agenda/SpeakersTab').then((m) => ({
    default: m.SpeakersTab,
  })),
)
const RequestsTab = lazy(() =>
  import('@/pages/workspace/agenda/RequestsTab').then((m) => ({
    default: m.RequestsTab,
  })),
)
const SettingsTab = lazy(() =>
  import('@/pages/workspace/agenda/SettingsTab').then((m) => ({
    default: m.SettingsTab,
  })),
)
const AgendaTab = lazy(() =>
  import('@/pages/workspace/sales/AgendaTab').then((m) => ({
    default: m.AgendaTab,
  })),
)
const SalesCalendarioTab = lazy(() =>
  import('@/pages/workspace/sales/CalendarioTab').then((m) => ({
    default: m.CalendarioTab,
  })),
)
const SalesSolicitudesTab = lazy(() =>
  import('@/pages/workspace/sales/SolicitudesTab').then((m) => ({
    default: m.SolicitudesTab,
  })),
)
const BuscadorTab = lazy(() =>
  import('@/pages/workspace/cs/BuscadorTab').then((m) => ({
    default: m.BuscadorTab,
  })),
)
const CsCalendarioTab = lazy(() =>
  import('@/pages/workspace/cs/CalendarioTab').then((m) => ({
    default: m.CalendarioTab,
  })),
)
const CsSolicitudesTab = lazy(() =>
  import('@/pages/workspace/cs/SolicitudesTab').then((m) => ({
    default: m.SolicitudesTab,
  })),
)

function RouteFallback() {
  return (
    <div className="grid min-h-screen place-content-center text-sm text-muted-foreground">
      Cargando…
    </div>
  )
}

function ProtectedRoute({
  children,
  requiredArea,
}: {
  children: ReactNode
  requiredArea?: Area
}) {
  const { usuario, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-content-center text-sm text-muted-foreground">
        Cargando…
      </div>
    )
  }
  if (!usuario) return <Navigate to="/login" replace />

  // Si requiredArea está definido y la persona no es admin ni de esa área,
  // vuelve a /home (que la reencamina a lo que sí puede ver).
  if (
    requiredArea &&
    usuario.area !== requiredArea &&
    usuario.rol !== 'admin'
  ) {
    return <Navigate to="/home" replace />
  }

  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route path="/" element={<Navigate to="/home" replace />} />

              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <WorkspaceHome />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/crm"
                element={
                  <ProtectedRoute>
                    <CrmGlobal />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/workspace/:id/agenda/settings"
                element={
                  <ProtectedRoute requiredArea="Agenda">
                    <SettingsLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<SettingsTab />} />
              </Route>

              <Route
                path="/workspace/:id/agenda"
                element={
                  <ProtectedRoute requiredArea="Agenda">
                    <WorkspaceLayout role="agenda" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardTab />} />
                <Route path="sesiones" element={<SesionesTab />} />
                <Route path="speakers" element={<SpeakersTab />} />
                <Route path="requests" element={<RequestsTab />} />
              </Route>

              <Route
                path="/workspace/:id/sales"
                element={
                  <ProtectedRoute requiredArea="Sales">
                    <WorkspaceLayout role="sales" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AgendaTab />} />
                <Route path="calendario" element={<SalesCalendarioTab />} />
                <Route path="solicitudes" element={<SalesSolicitudesTab />} />
              </Route>

              <Route
                path="/workspace/:id/cs"
                element={
                  <ProtectedRoute requiredArea="CS">
                    <WorkspaceLayout role="cs" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<BuscadorTab />} />
                <Route path="calendario" element={<CsCalendarioTab />} />
                <Route path="solicitudes" element={<CsSolicitudesTab />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </WorkspaceProvider>
    </AuthProvider>
  </StrictMode>,
)
