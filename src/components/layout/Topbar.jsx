import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'

export default function Topbar() {
  const navigate = useNavigate()
  const { profile, user, signOut } = useAuth()

  async function handleLogout() {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      console.error('Errore logout:', error.message)
    }
  }

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar__title">Club Orchidea ASD</h1>
        <p className="topbar__subtitle">
          {profile?.full_name || user?.email || 'Utente autenticato'}
        </p>
      </div>

      <div className="topbar__actions">
        <div className="topbar__userpill">
          <span className="topbar__role">{profile?.role || 'utente'}</span>
        </div>
        <button className="topbar__button" onClick={handleLogout}>
          Esci
        </button>
      </div>
    </header>
  )
}