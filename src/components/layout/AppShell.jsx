import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="shell">
      <div
        className={`sidebar__backdrop ${sidebarOpen ? 'sidebar__backdrop--visible' : ''}`}
        onClick={closeSidebar}
      />

      <Sidebar isOpen={sidebarOpen} onNavigate={closeSidebar} />

      <div className="shell__content">
        <Topbar onMenuClick={toggleSidebar} />
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}