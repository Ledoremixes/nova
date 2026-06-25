import { Download, FileSpreadsheet, HeartPulse, Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../api/dashboard'
import { fetchOrchideaStudents } from '../api/orchideaEntities'

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function UtilitaPage() {
  const studentsQuery = useQuery({ queryKey: ['utilities-students'], queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }) })
  const statsQuery = useQuery({ queryKey: ['utilities-stats'], queryFn: fetchDashboardStats })

  function exportTesserati() {
    const rows = [['Nome', 'Cognome', 'Email', 'Telefono', 'Codice fiscale', 'Tessera', 'Corsista']]
    ;(studentsQuery.data || []).forEach((s) => rows.push([s.nome, s.cognome, s.email, s.telefono, s.cf, s.numero_tessera, s.is_corsista ? 'Sì' : 'No']))
    downloadCsv(`tesserati-orchidea-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  function exportRiepilogo() {
    const stats = statsQuery.data
    const rows = [['Voce', 'Valore'], ['Entrate', stats?.totalEntrate || 0], ['Uscite', stats?.totalUscite || 0], ['Saldo', stats?.saldo || 0], ['Movimenti', stats?.totalMovements || 0]]
    downloadCsv(`riepilogo-nova-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <section className="page">
      <div className="dashboard-hero"><div><div className="dashboard-hero__eyebrow">Strumenti rapidi</div><h2 className="dashboard-hero__title">Utilità</h2><p className="dashboard-hero__text">Piccoli strumenti operativi per esportazioni, controlli e manutenzione del gestionale.</p></div><Wrench size={42} /></div>
      <div className="cardsGrid">
        <div className="page-card utility-card"><FileSpreadsheet size={32} /><h3>Esporta tesserati</h3><p>Scarica CSV con i tesserati letti dal database Orchidea Allievi.</p><button className="topbar__button topbar__button--primary" onClick={exportTesserati} disabled={studentsQuery.isLoading}><Download size={16} /> Esporta CSV</button></div>
        <div className="page-card utility-card"><FileSpreadsheet size={32} /><h3>Riepilogo contabile</h3><p>Scarica un CSV sintetico con entrate, uscite, saldo e numero movimenti.</p><button className="topbar__button" onClick={exportRiepilogo} disabled={statsQuery.isLoading}>Esporta riepilogo</button></div>
        <div className="page-card utility-card"><HeartPulse size={32} /><h3>Checklist operativa</h3><p>Verifica: env Supabase Nova, env Orchidea Allievi, RLS lookup globali, storage visite mediche.</p><ul className="utility-list"><li>VITE_SUPABASE_URL → Nova</li><li>VITE_ORCHIDEA_SUPABASE_URL → Orchidea Allievi</li><li>Bucket medical-visits creato</li></ul></div>
      </div>
    </section>
  )
}
