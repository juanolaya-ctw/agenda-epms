import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { RoleProvider } from '@/contexts/RoleContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { RequireRole } from '@/components/layout/RequireRole'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { RoleSelect } from '@/pages/RoleSelect'
import { WorkspaceHome } from '@/pages/WorkspaceHome'
import { CrmGlobal } from '@/pages/CrmGlobal'
import { NotFound } from '@/pages/NotFound'
import { DashboardTab } from '@/pages/workspace/agenda/DashboardTab'
import { SesionesTab } from '@/pages/workspace/agenda/SesionesTab'
import { TablaTab } from '@/pages/workspace/agenda/TablaTab'
import { CalendarioTab as AgendaCalendarioTab } from '@/pages/workspace/agenda/CalendarioTab'
import { SpeakersTab } from '@/pages/workspace/agenda/SpeakersTab'
import { RequestsTab } from '@/pages/workspace/agenda/RequestsTab'
import { AgendaTab } from '@/pages/workspace/sales/AgendaTab'
import { CalendarioTab as SalesCalendarioTab } from '@/pages/workspace/sales/CalendarioTab'
import { SolicitudesTab as SalesSolicitudesTab } from '@/pages/workspace/sales/SolicitudesTab'
import { BuscadorTab } from '@/pages/workspace/cs/BuscadorTab'
import { CalendarioTab as CsCalendarioTab } from '@/pages/workspace/cs/CalendarioTab'
import { SolicitudesTab as CsSolicitudesTab } from '@/pages/workspace/cs/SolicitudesTab'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoleProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RoleSelect />} />

            <Route element={<RequireRole allow="any" />}>
              <Route path="/home" element={<WorkspaceHome />} />
              <Route path="/crm" element={<CrmGlobal />} />
            </Route>

            <Route element={<RequireRole allow="agenda" />}>
              <Route
                path="/workspace/:id/agenda"
                element={<WorkspaceLayout role="agenda" />}
              >
                <Route index element={<DashboardTab />} />
                <Route path="sesiones" element={<SesionesTab />} />
                <Route path="tabla" element={<TablaTab />} />
                <Route path="calendario" element={<AgendaCalendarioTab />} />
                <Route path="speakers" element={<SpeakersTab />} />
                <Route path="requests" element={<RequestsTab />} />
              </Route>
            </Route>

            <Route element={<RequireRole allow="sales" />}>
              <Route
                path="/workspace/:id/sales"
                element={<WorkspaceLayout role="sales" />}
              >
                <Route index element={<AgendaTab />} />
                <Route path="calendario" element={<SalesCalendarioTab />} />
                <Route path="solicitudes" element={<SalesSolicitudesTab />} />
              </Route>
            </Route>

            <Route element={<RequireRole allow="cs" />}>
              <Route
                path="/workspace/:id/cs"
                element={<WorkspaceLayout role="cs" />}
              >
                <Route index element={<BuscadorTab />} />
                <Route path="calendario" element={<CsCalendarioTab />} />
                <Route path="solicitudes" element={<CsSolicitudesTab />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </WorkspaceProvider>
    </RoleProvider>
  </StrictMode>,
)
