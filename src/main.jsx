import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from './context/AuthProvider'
import { cleanupLegacyServiceWorkers } from './lib/legacyServiceWorkerCleanup'
import './styles/global.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/cards.css'
import './styles/pages.css'
import './styles/forms.css'
import './styles/tables.css'
import './styles/modules.css'

async function bootstrap() {
  // Prima di far partire query/API eliminiamo l'eventuale vecchia sw.js: in caso
  // contrario potrebbe ancora intercettare le prime fetch e produrre i vecchi
  // errori Response.clone() mostrati in console.
  const legacyWorkerRemoved = await cleanupLegacyServiceWorkers()
  if (legacyWorkerRemoved && navigator.serviceWorker?.controller) return

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  })

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
