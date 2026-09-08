import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { SettingsLayout } from '@/components/layout/SettingsLayout'
import { Toaster } from '@/components/ui/sonner'
import { LoginPage } from '@/pages/LoginPage'
import { WorkspaceHome } from '@/pages/WorkspaceHome'
import { CrmGlobal } from '@/pages/CrmGlobal'
import { NotFound } from '@/pages/NotFound'
import { DashboardTab } from '@/pages/workspace/agenda/DashboardTab'
import { SesionesTab } from '@/pages/workspace/agenda/SesionesTab'
import { SpeakersTab } from '@/pages/workspace/agenda/SpeakersTab'
import { RequestsTab } from '@/pages/workspace/agenda/RequestsTab'
import { SettingsTab } from '@/pages/workspace/agenda/SettingsTab'
import { AgendaTab } from '@/pages/workspace/sales/AgendaTab'
import { CalendarioTab as SalesCalendarioTab } from '@/pages/workspace/sales/CalendarioTab'
import { SolicitudesTab as SalesSolicitudesTab } from '@/pages/workspace/sales/SolicitudesTab'
import { BuscadorTab } from '@/pages/workspace/cs/BuscadorTab'
import { CalendarioTab as CsCalendarioTab } from '@/pages/workspace/cs/CalendarioTab'
import { SolicitudesTab as CsSolicitudesTab } from '@/pages/workspace/cs/SolicitudesTab'
import type { Area } from '@/lib/workspaceRoutes'

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
        </BrowserRouter>
        <Toaster />
      </WorkspaceProvider>
    </AuthProvider>
  </StrictMode>,
)
