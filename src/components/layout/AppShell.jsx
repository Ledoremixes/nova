import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import TesseratiRealtimeSync from './TesseratiRealtimeSync'
import { fetchOrchideaCourseCatalog, fetchOrchideaStudents } from '../../api/orchideaEntities'
import { fetchPackagesCatalog } from '../../api/packagesCatalog'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    const warmup = () => {
      if (cancelled) return
      queryClient.prefetchQuery({
        queryKey: ['orchidea-atleti-corsisti'],
        queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
        staleTime: 3 * 60_000,
      })
      queryClient.prefetchQuery({
        queryKey: ['orchidea-course-catalog'],
        queryFn: fetchOrchideaCourseCatalog,
        staleTime: 10 * 60_000,
      })
      queryClient.prefetchQuery({
        queryKey: ['nova-packages-catalog', { activeOnly: true }],
        queryFn: () => fetchPackagesCatalog({ includeInactive: false }),
        staleTime: 10 * 60_000,
      })
    }

    const timer = window.setTimeout(warmup, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [queryClient])

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="shell">
      <TesseratiRealtimeSync />
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