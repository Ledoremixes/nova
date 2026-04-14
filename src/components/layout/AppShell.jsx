import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell__content">
        <Topbar />
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}