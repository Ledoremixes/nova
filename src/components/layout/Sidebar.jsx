import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  GraduationCap,
  HeartPulse,
  CalendarDays,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  PartyPopper,
  ShoppingCart,
  Megaphone,
  Wrench,
  Smartphone,
  ClipboardList,
  UserCog,
  BookOpen,
  Receipt,
  ShieldCheck,
} from 'lucide-react'

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tesserati', label: 'Tesserati', icon: Users },
  { to: '/gruppi', label: 'Gruppi', icon: Users },
  { to: '/atleti', label: 'Atleti', icon: UserSquare2 },
  { to: '/contabilita', label: 'Contabilità', icon: BarChart3 },
  { to: '/prima-nota', label: 'Prima nota', icon: Receipt },
  { to: '/insegnanti', label: 'Insegnanti', icon: GraduationCap },
  { to: '/allenatori', label: 'Allenatori', icon: GraduationCap },
  { to: '/visite-mediche', label: 'Visite mediche', icon: HeartPulse },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/pagamenti', label: 'Pagamenti', icon: Wallet },
  { to: '/fatturazione', label: 'Fatturazione', icon: FileText },
  { to: '/amministrazione', label: 'Amministrazione', icon: Settings },
  { to: '/gestione-eventi', label: 'Gestione eventi', icon: PartyPopper },
  { to: '/shop', label: 'Shop', icon: ShoppingCart },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/utilita', label: 'Utilità', icon: Wrench },
  { to: '/app', label: 'App', icon: Smartphone },
  { to: '/iscrizioni-online', label: 'Iscrizioni online', icon: ClipboardList },
  { to: '/account', label: 'Account', icon: UserCog },
  { to: '/guida-tutorial', label: 'Guida e tutorial', icon: BookOpen },
  { to: '/conti', label: 'Conti', icon: Wallet },
  { to: '/utenti', label: 'Utenti', icon: UserCog },
  { to: '/audit', label: 'Audit', icon: ShieldCheck },
]

export default function Sidebar({ isOpen, onNavigate }) {
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
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}