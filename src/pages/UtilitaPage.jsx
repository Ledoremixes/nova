import { useState } from 'react'
import { supabase } from '../api/supabase'
import { ORCHIDEA_CANARY_STORAGE_KEY, shouldUseOrchideaServerBridge, hasDedicatedOrchideaConfig } from '../api/orchideaSupabase'
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
  const studentsQuery = useQuery({ queryKey: ['utilities-students'], queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }), staleTime: 3 * 60_000, gcTime: 15 * 60_000 })
  const statsQuery = useQuery({ queryKey: ['utilities-stats'], queryFn: fetchDashboardStats })
  const [securityChecks, setSecurityChecks] = useState(null)
  const [securityLoading, setSecurityLoading] = useState(false)

  async function verifyOrchideaGateway() {
    setSecurityLoading(true)
    setSecurityChecks(null)
    try {
      const { data, error } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (error || !token) throw new Error('Sessione Nova non disponibile. Ripeti il login.')
      const targets = [
        ['Tesserati', 'tesseramenti'], ['Pagamenti', 'pagamenti'],
        ['Iscrizioni', 'iscrizioni_corsi'], ['Corsi', 'corsi'],
        ['Insegnanti corsi', 'insegnanti_corsi'], ['Prezzi pacchetti', 'nova_package_pricing_history'],
      ]
      const checks = await Promise.all(targets.map(async ([label, table]) => {
        try {
          const response = await fetch('/api/orchidea-payments-read', {
            method: 'POST', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
              operation: 'postgrest-bridge', httpMethod: 'HEAD',
              path: '/rest/v1/' + table + '?select=id&limit=1',
              headers: { prefer: 'count=exact' },
            }),
          })
          return { label, ok: response.ok, status: response.status }
        } catch {
          return { label, ok: false, status: 'rete' }
        }
      }))
      const allOk = checks.every((item) => item.ok)
      setSecurityChecks({ allOk, checks, message: allOk
        ? 'Tutte le sei letture protette sono riuscite. Puoi abilitare il collaudo soltanto nella tua scheda.'
        : 'Uno o più collegamenti non sono disponibili: la modalità di collaudo rimane disabilitata.' })
    } catch (error) {
      setSecurityChecks({ allOk: false, checks: [], message: error?.message || 'Verifica non disponibile.' })
    } finally {
      setSecurityLoading(false)
    }
  }

  function setBridgeCanary(enabled) {
    if (enabled && !securityChecks?.allOk) return
    try {
      if (enabled) window.sessionStorage.setItem(ORCHIDEA_CANARY_STORAGE_KEY, '1')
      else window.sessionStorage.removeItem(ORCHIDEA_CANARY_STORAGE_KEY)
      // Reload updates the dedicated Supabase transport for this tab only.
      window.location.reload()
    } catch {
      setSecurityChecks({ allOk: false, checks: [], message: 'Non riesco a salvare la modalità di test nel browser.' })
    }
  }


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
        <div className="page-card utility-card">
          <HeartPulse size={32} />
          <h3>Verifica sicurezza collegamento Orchidea</h3>
          <p>Controllo di sola lettura tramite backend Nova autenticato: non registra pagamenti e non modifica tesserati.</p>
          <p><strong>Modalità:</strong> {shouldUseOrchideaServerBridge ? 'Collaudo protetto attivo in questa scheda' : 'Operatività standard: invariata'}</p>
          {!hasDedicatedOrchideaConfig && <p>Database Orchidea dedicato non configurato. Non attivare il collaudo.</p>}
          <button className="topbar__button" type="button" disabled={!hasDedicatedOrchideaConfig || securityLoading} onClick={verifyOrchideaGateway}>
            {securityLoading ? 'Verifica in corso...' : 'Verifica collegamento protetto'}
          </button>
          {securityChecks && (
            <div aria-live="polite">
              <p>{securityChecks.message}</p>
              <ul className="utility-list">
                {securityChecks.checks.map((check) => (
                  <li key={check.label}>{check.ok ? '✓' : '✕'} {check.label} — HTTP {check.status}</li>
                ))}
              </ul>
            </div>
          )}
          <p>Il test si applica soltanto alla tua sessione: gli altri operatori Nova continuano a usare il collegamento precedente.</p>
          {shouldUseOrchideaServerBridge ? (
            <button className="topbar__button" type="button" onClick={() => setBridgeCanary(false)}>Disattiva collaudo nella mia scheda</button>
          ) : (
            <button className="topbar__button topbar__button--primary" type="button" disabled={!securityChecks?.allOk || securityLoading} onClick={() => setBridgeCanary(true)}>
              Attiva collaudo solo nella mia scheda
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
