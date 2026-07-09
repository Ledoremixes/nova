import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import DashboardPage from '../pages/DashboardPage'
import TesseratiPage from '../pages/TesseratiPage'
import InsegnantiPage from '../pages/InsegnantiPage'
import EntriesPage from '../pages/EntriesPage'
import AdminUsersPage from '../pages/AdminUsersPage'
import AuditPage from '../pages/AuditPage'
import LoginPage from '../pages/LoginPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import VisiteMedichePage from '../pages/VisiteMedichePage'
import AccountPage from '../pages/AccountPage'
import UtilitaPage from '../pages/UtilitaPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import ContabilitaPage from '../pages/ContabilitaPage'
import PagamentiPage from '../pages/PagamentiPage'
import AtletiPage from '../pages/AtletiPage'
import ContiPage from '../pages/ContiPage'
import GruppiPage from '../pages/GruppiPage'
import PacchettiPage from '../pages/PacchettiPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/forbidden',
    element: <ForbiddenPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },

      { path: 'gruppi', element: <GruppiPage title="Gruppi" /> },
      { path: 'atleti', element: <AtletiPage /> },
      { path: 'visite-mediche', element: (<ProtectedRoute roles={['admin']}><VisiteMedichePage /></ProtectedRoute>) },
      { path: 'calendario', element: (<ProtectedRoute roles={['admin']}><ComingSoonPage title="Calendario" /></ProtectedRoute>) },
      { path: 'pagamenti', element: <PagamentiPage /> },
      { path: 'pacchetti', element: <PacchettiPage /> },
      { path: 'gestione-eventi', element: (<ProtectedRoute roles={['admin']}><ComingSoonPage title="Gestione eventi" /></ProtectedRoute>) },
      { path: 'shop', element: (<ProtectedRoute roles={['admin']}><ComingSoonPage title="Shop" /></ProtectedRoute>) },
      { path: 'marketing', element: (<ProtectedRoute roles={['admin']}><ComingSoonPage title="Marketing" /></ProtectedRoute>) },
      { path: 'utilita', element: (<ProtectedRoute roles={['admin']}><UtilitaPage /></ProtectedRoute>) },
      { path: 'account', element: <AccountPage /> },
      { path: 'guida-tutorial', element: (<ProtectedRoute roles={['admin']}><ComingSoonPage title="Guida e tutorial" /></ProtectedRoute>) },

      { path: 'tesserati', element: <TesseratiPage /> },
      { path: 'insegnanti', element: <InsegnantiPage /> },
      { path: 'prima-nota', element: (<ProtectedRoute roles={['admin']}><EntriesPage /></ProtectedRoute>) },
      { path: 'conti', element: (<ProtectedRoute roles={['admin']}><ContiPage /></ProtectedRoute>) },
      { path: 'contabilita', element: (<ProtectedRoute roles={['admin']}><ContabilitaPage /></ProtectedRoute>) },

      { path: 'amministrazione', element: <Navigate to="/utenti" replace /> },
      {
        path: 'utenti',
        element: (
          <ProtectedRoute roles={['admin']}>
            <AdminUsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute roles={['admin']}>
            <AuditPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
])