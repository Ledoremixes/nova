import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import DashboardPage from '../pages/DashboardPage'
import TesseratiPage from '../pages/TesseratiPage'
import InsegnantiPage from '../pages/InsegnantiPage'
import EntriesPage from '../pages/EntriesPage'
import AccountsPage from '../pages/AccountsPage'
import AdminUsersPage from '../pages/AdminUsersPage'
import AuditPage from '../pages/AuditPage'
import LoginPage from '../pages/LoginPage'
import ComingSoonPage from '../pages/ComingSoonPage'
import ForbiddenPage from '../pages/ForbiddenPage'
import ContabilitaPage from '../pages/ContabilitaPage'
import PagamentiPage from '../pages/PagamentiPage'
import AtletiPage from '../pages/AtletiPage'
import ContiPage from '../pages/ContiPage'
import GruppiPage from '../pages/GruppiPage'

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
      { path: 'allenatori', element: <ComingSoonPage title="Allenatori" /> },
      { path: 'visite-mediche', element: <ComingSoonPage title="Visite mediche" /> },
      { path: 'calendario', element: <ComingSoonPage title="Calendario" /> },
      { path: 'pagamenti', element: <PagamentiPage /> },
      { path: 'fatturazione', element: <ComingSoonPage title="Fatturazione" /> },
      { path: 'gestione-eventi', element: <ComingSoonPage title="Gestione eventi" /> },
      { path: 'shop', element: <ComingSoonPage title="Shop" /> },
      { path: 'marketing', element: <ComingSoonPage title="Marketing" /> },
      { path: 'utilita', element: <ComingSoonPage title="Utilità" /> },
      { path: 'app', element: <ComingSoonPage title="App" /> },
      { path: 'iscrizioni-online', element: <ComingSoonPage title="Iscrizioni online" /> },
      { path: 'account', element: <ComingSoonPage title="Account" /> },
      { path: 'guida-tutorial', element: <ComingSoonPage title="Guida e tutorial" /> },

      { path: 'tesserati', element: <TesseratiPage /> },
      { path: 'insegnanti', element: <InsegnantiPage /> },
      { path: 'prima-nota', element: <EntriesPage /> },
      { path: 'conti', element: <ContiPage /> },
      { path: 'contabilita', element: <ContabilitaPage /> },

      {
        path: 'amministrazione',
        element: (
          <ProtectedRoute roles={['admin']}>
            <AdminUsersPage />
          </ProtectedRoute>
        ),
      },
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