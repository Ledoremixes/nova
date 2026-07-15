import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Filter,
  Info,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { ModuleEmpty, ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

function severityTone(severity) {
  if (severity === 'Successo') return 'success'
  if (severity === 'Attenzione') return 'warning'
  return 'blue'
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function withinPeriod(timestamp, period) {
  if (period === 'Tutto il periodo') return true
  const days = period === 'Oggi' ? 1 : period === 'Ultimi 7 giorni' ? 7 : 30
  const difference = Date.now() - new Date(timestamp).getTime()
  return difference >= 0 && difference <= days * 86400000
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export default function AuditPage() {
  const { data } = useNovaModules()
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('Tutti i moduli')
  const [severity, setSeverity] = useState('Tutti i livelli')
  const [period, setPeriod] = useState('Tutto il periodo')
  const [selected, setSelected] = useState(null)

  const modules = ['Tutti i moduli', ...new Set(data.auditLogs.map((item) => item.module))]
  const logs = useMemo(() => data.auditLogs
    .filter((item) => module === 'Tutti i moduli' || item.module === module)
    .filter((item) => severity === 'Tutti i livelli' || item.severity === severity)
    .filter((item) => withinPeriod(item.timestamp, period))
    .filter((item) => `${item.action} ${item.detail} ${item.actor} ${item.module}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [data.auditLogs, module, period, search, severity])

  const today = new Date().toDateString()
  const todayCount = data.auditLogs.filter((item) => new Date(item.timestamp).toDateString() === today).length
  const warningCount = data.auditLogs.filter((item) => item.severity === 'Attenzione').length
  const actors = new Set(data.auditLogs.map((item) => item.actor)).size

  function exportCsv() {
    const rows = [
      ['Data e ora', 'Livello', 'Modulo', 'Operazione', 'Utente', 'Dettaglio'],
      ...logs.map((item) => [formatTimestamp(item.timestamp), item.severity, item.module, item.action, item.actor, item.detail]),
    ]
    const blob = new Blob([rows.map((row) => row.map(escapeCsv).join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `audit-nova-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Sicurezza e tracciabilità"
        title="Audit"
        description="Consulta le operazioni registrate nei nuovi moduli, individua anomalie ed esporta il registro filtrato."
        icon={ShieldCheck}
      >
        <button className="module-button module-button--primary" type="button" onClick={exportCsv}><Download size={17} /> Esporta CSV</button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Attività registrate" value={data.auditLogs.length} caption="Registro operativo disponibile" icon={Activity} />
        <ModuleMetric label="Operazioni di oggi" value={todayCount} caption="Attività nella giornata" icon={Clock3} tone="blue" />
        <ModuleMetric label="Da verificare" value={warningCount} caption="Segnalazioni di attenzione" icon={AlertTriangle} tone="amber" />
        <ModuleMetric label="Attori distinti" value={actors} caption="Utenti e processi registrati" icon={UserRound} tone="green" />
      </div>

      <div className="page-card module-card audit-card">
        <div className="module-toolbar audit-toolbar">
          <label className="module-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca operazione, utente o dettaglio…" /></label>
          <select className="module-select" value={module} onChange={(event) => setModule(event.target.value)}>{modules.map((item) => <option key={item}>{item}</option>)}</select>
          <select className="module-select" value={severity} onChange={(event) => setSeverity(event.target.value)}><option>Tutti i livelli</option><option>Info</option><option>Successo</option><option>Attenzione</option></select>
          <select className="module-select" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Tutto il periodo</option><option>Oggi</option><option>Ultimi 7 giorni</option><option>Ultimi 30 giorni</option></select>
        </div>
        <div className="audit-result-head"><span><Filter size={16} /> {logs.length} risultati</span><small>Gli elementi più recenti sono mostrati per primi.</small></div>

        {logs.length ? <div className="module-table-wrap"><table className="module-table audit-table">
          <thead><tr><th>Data e ora</th><th>Livello</th><th>Modulo</th><th>Operazione</th><th>Utente</th><th></th></tr></thead>
          <tbody>{logs.map((item) => <tr key={item.id}><td><span className="audit-time">{formatTimestamp(item.timestamp)}</span></td><td><span className={`module-badge is-${severityTone(item.severity)}`}>{item.severity === 'Successo' ? <CheckCircle2 size={14} /> : item.severity === 'Attenzione' ? <AlertTriangle size={14} /> : <Info size={14} />}{item.severity}</span></td><td><span className="audit-module">{item.module}</span></td><td><strong>{item.action}</strong><small>{item.detail}</small></td><td>{item.actor}</td><td><button className="module-icon-button" type="button" onClick={() => setSelected(item)} aria-label="Dettagli"><Eye size={17} /></button></td></tr>)}</tbody>
        </table></div> : <ModuleEmpty icon={ShieldCheck} title="Nessuna attività trovata" text="Modifica i filtri per ampliare la ricerca." />}
      </div>

      <ModuleModal open={!!selected} onClose={() => setSelected(null)} title={selected?.action || ''} subtitle={selected ? formatTimestamp(selected.timestamp) : ''} icon={ShieldCheck}>
        {selected ? <div className="module-detail audit-detail">
          <div className="audit-detail__status"><span className={`module-badge is-${severityTone(selected.severity)}`}>{selected.severity}</span><span className="module-badge is-neutral">{selected.module}</span></div>
          <div className="module-detail__row"><UserRound size={18} /><div><small>Utente / processo</small><strong>{selected.actor}</strong></div></div>
          <div className="module-detail__row"><Activity size={18} /><div><small>Operazione</small><strong>{selected.action}</strong></div></div>
          <div className="module-detail__note">{selected.detail}</div>
          <div className="audit-detail__id"><small>ID registrazione</small><code>{selected.id}</code></div>
        </div> : null}
      </ModuleModal>
    </section>
  )
}
