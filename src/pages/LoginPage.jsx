import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

export default function LoginPage() {
  const { signIn, isAuthenticated, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message || 'Login non riuscito')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-card__badge">Nova</div>
        <h1>Accedi al gestionale</h1>
        <p>Inserisci le credenziali del tuo account Supabase.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="nome@dominio.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </section>
  )
}