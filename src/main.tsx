import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { RoleProvider } from '@/contexts/RoleContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { RoleSelect } from '@/pages/RoleSelect'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { CrmPage } from '@/pages/CrmPage'
import { ResumenPage } from '@/pages/admin/ResumenPage'
import { SesionesPage } from '@/pages/admin/SesionesPage'
import { SpeakersPage } from '@/pages/admin/SpeakersPage'
import { RequestsPage as AdminRequestsPage } from '@/pages/admin/RequestsPage'
import { ExplorePage } from '@/pages/sales/ExplorePage'
import { RequestsPage as SalesRequestsPage } from '@/pages/sales/RequestsPage'
import { SearchPage } from '@/pages/cs/SearchPage'
import { RequestsPage as CsRequestsPage } from '@/pages/cs/RequestsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoleProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoleSelect />} />

          <Route path="/admin" element={<AppLayout role="agenda" />}>
            <Route index element={<ResumenPage />} />
            <Route path="sesiones" element={<SesionesPage />} />
            <Route path="speakers" element={<SpeakersPage />} />
            <Route path="requests" element={<AdminRequestsPage />} />
          </Route>

          <Route path="/sales" element={<AppLayout role="sales" />}>
            <Route index element={<ExplorePage />} />
            <Route path="requests" element={<SalesRequestsPage />} />
          </Route>

          <Route path="/cs" element={<AppLayout role="cs" />}>
            <Route index element={<SearchPage />} />
            <Route path="requests" element={<CsRequestsPage />} />
          </Route>

          <Route path="/crm" element={<AppLayout role="agenda" />}>
            <Route index element={<CrmPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </RoleProvider>
  </StrictMode>,
)
