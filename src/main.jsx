import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from './context/AuthProvider'
import './styles/global.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/cards.css'
import './styles/pages.css'
import './styles/forms.css'
import './styles/tables.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)