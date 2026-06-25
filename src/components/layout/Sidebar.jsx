import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  GraduationCap,
  HeartPulse,
  CalendarDays,
  Wallet,
  BarChart3,
  PartyPopper,
  ShoppingCart,
  Megaphone,
  Wrench,
  UserCog,
  BookOpen,
  Receipt,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthProvider'

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'user'] },
  { to: '/tesserati', label: 'Tesserati', icon: Users, roles: ['admin', 'user'] },
  { to: '/gruppi', label: 'Corsi e gruppi', icon: Users, roles: ['admin', 'user'] },
  { to: '/atleti', label: 'Atleti', icon: UserSquare2, roles: ['admin', 'user'] },
  { to: '/insegnanti', label: 'Insegnanti', icon: GraduationCap, roles: ['admin', 'user'] },
  { to: '/visite-mediche', label: 'Visite mediche', icon: HeartPulse, roles: ['admin'] },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, roles: ['admin'] },
  { to: '/pagamenti', label: 'Pagamenti', icon: Wallet, roles: ['admin'] },
  { to: '/contabilita', label: 'Contabilità', icon: BarChart3, roles: ['admin'] },
  { to: '/prima-nota', label: 'Prima nota', icon: Receipt, roles: ['admin'] },
  { to: '/gestione-eventi', label: 'Gestione eventi', icon: PartyPopper, roles: ['admin'] },
  { to: '/shop', label: 'Shop', icon: ShoppingCart, roles: ['admin'] },
  { to: '/marketing', label: 'Marketing', icon: Megaphone, roles: ['admin'] },
  { to: '/utilita', label: 'Utilità', icon: Wrench, roles: ['admin'] },
  { to: '/account', label: 'Account', icon: UserCog, roles: ['admin', 'user'] },
  { to: '/guida-tutorial', label: 'Guida e tutorial', icon: BookOpen, roles: ['admin'] },
  { to: '/conti', label: 'Conti', icon: Wallet, roles: ['admin'] },
  { to: '/utenti', label: 'Utenti', icon: UserCog, roles: ['admin'] },
  { to: '/audit', label: 'Audit', icon: ShieldCheck, roles: ['admin'] },
]

export default function Sidebar({ isOpen, onNavigate }) {
  const { role } = useAuth()
  const currentRole = role || 'user'
  const visibleItems = items.filter((item) => item.roles.includes(currentRole))

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo sidebar__logo--image">
          <img src="/NOVA.png" alt="Logo Orchidea" className="sidebar__logo-img" />
        </div>
        <div>
          <div className="sidebar__title">Nova</div>
          <div className="sidebar__subtitle">Gestionale ASD</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'}>
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
