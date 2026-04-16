import { Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'

export default function Topbar({ onMenuClick }) {
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
      <div className="topbar__left">
        <button
          type="button"
          className="topbar__menuBtn"
          onClick={onMenuClick}
          aria-label="Apri menu"
        >
          <Menu size={20} />
        </button>

        <div className="topbar__brand">
          <img
            src="/orchidea.png"
            alt="Logo Orchidea"
            className="topbar__logo"
          />

          <div className="topbar__brandText">
            <h1 className="topbar__title">Club Orchidea ASD</h1>
            <p className="topbar__subtitle">
              {profile?.full_name || user?.email || 'Utente autenticato'}
            </p>
          </div>
        </div>
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