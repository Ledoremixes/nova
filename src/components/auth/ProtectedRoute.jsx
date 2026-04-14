import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'

export default function ProtectedRoute({ children, roles = [] }) {
  const { loading, isAuthenticated, profile, role, isActive } = useAuth()

  if (loading) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Caricamento...</h2>
          <p>Sto verificando la sessione utente.</p>
        </div>
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Profilo non trovato</h2>
          <p>Login riuscito, ma non riesco a leggere la riga in public.users.</p>
        </div>
      </section>
    )
  }

  if (!isActive) {
    return <Navigate to="/forbidden" replace />
  }

  if (roles.length > 0 && !roles.includes(role)) {
    return <Navigate to="/forbidden" replace />
  }

  return children
}