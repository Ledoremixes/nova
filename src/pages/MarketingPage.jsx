import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Goal,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  UsersRound,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { createId, formatCurrency, formatItalianDate } from '../lib/novaModulesStore'
import { ModuleEmpty, ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

const statuses = ['Bozza', 'Pianificata', 'Attiva', 'Completata']
const channels = ['Instagram', 'Facebook', 'Instagram + Meta Ads', 'Instagram + WhatsApp', 'Email', 'WhatsApp', 'Offline', 'Multicanale']
const emptyCampaign = {
  name: '',
  objective: '',
  channel: 'Instagram',
  startDate: '',
  endDate: '',
  budget: 0,
  spent: 0,
  status: 'Bozza',
  leads: 0,
  goal: 100,
  owner: '',
}

function campaignTone(status) {
  if (status === 'Attiva') return 'success'
  if (status === 'Pianificata') return 'blue'
  if (status === 'Completata') return 'neutral'
  return 'warning'
}

export default function MarketingPage() {
  const { data, commit } = useNovaModules()
  const [view, setView] = useState('pipeline')
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('Tutti i canali')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyCampaign)

  const campaigns = useMemo(() => data.campaigns
    .filter((item) => channel === 'Tutti i canali' || item.channel === channel)
    .filter((item) => `${item.name} ${item.objective} ${item.channel} ${item.owner}`.toLowerCase().includes(search.toLowerCase())), [channel, data.campaigns, search])

  const active = data.campaigns.filter((item) => item.status === 'Attiva').length
  const budget = data.campaigns.reduce((sum, item) => sum + Number(item.budget || 0), 0)
  const spent = data.campaigns.reduce((sum, item) => sum + Number(item.spent || 0), 0)
  const leads = data.campaigns.reduce((sum, item) => sum + Number(item.leads || 0), 0)
  const goals = data.campaigns.reduce((sum, item) => sum + Number(item.goal || 0), 0)
  const performance = goals ? Math.round((leads / goals) * 100) : 0

  function newCampaign() {
    setEditingId(null)
    setForm(emptyCampaign)
    setOpen(true)
  }

  function editCampaign(campaign) {
    setEditingId(campaign.id)
    setForm({ ...campaign })
    setOpen(true)
  }

  function submit(event) {
    event.preventDefault()
    const normalized = {
      ...form,
      budget: Number(form.budget || 0),
      spent: Number(form.spent || 0),
      leads: Number(form.leads || 0),
      goal: Number(form.goal || 0),
    }
    if (editingId) {
      commit(
        (current) => ({ ...current, campaigns: current.campaigns.map((item) => item.id === editingId ? { ...normalized, id: editingId } : item) }),
        { action: 'Campagna aggiornata', module: 'Marketing', detail: `${normalized.name} · ${normalized.status}`, severity: 'Successo' }
      )
    } else {
      const item = { ...normalized, id: createId('cmp') }
      commit(
        (current) => ({ ...current, campaigns: [...current.campaigns, item] }),
        { action: 'Campagna pianificata', module: 'Marketing', detail: `${item.name} · ${formatItalianDate(item.startDate)}`, severity: 'Successo' }
      )
    }
    setOpen(false)
  }

  function updateStatus(campaign, nextStatus) {
    commit(
      (current) => ({ ...current, campaigns: current.campaigns.map((item) => item.id === campaign.id ? { ...item, status: nextStatus } : item) }),
      { action: 'Stato campagna modificato', module: 'Marketing', detail: `${campaign.name} → ${nextStatus}`, severity: 'Info' }
    )
  }

  function removeCampaign(campaign) {
    if (!window.confirm(`Eliminare la campagna “${campaign.name}”?`)) return
    commit(
      (current) => ({ ...current, campaigns: current.campaigns.filter((item) => item.id !== campaign.id) }),
      { action: 'Campagna eliminata', module: 'Marketing', detail: campaign.name, severity: 'Attenzione' }
    )
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Strategia e comunicazione"
        title="Marketing"
        description="Pianifica le campagne, assegna budget e responsabili e monitora l’avanzamento degli obiettivi."
        icon={Megaphone}
      >
        <button className="module-button module-button--primary" type="button" onClick={newCampaign}><Plus size={17} /> Pianifica campagna</button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Campagne attive" value={active} caption={`${data.campaigns.length} campagne totali`} icon={Megaphone} />
        <ModuleMetric label="Budget pianificato" value={formatCurrency(budget)} caption={`${formatCurrency(spent)} già utilizzati`} icon={CircleDollarSign} tone="amber" />
        <ModuleMetric label="Lead generati" value={leads} caption={`Obiettivo complessivo ${goals}`} icon={UsersRound} tone="blue" />
        <ModuleMetric label="Avanzamento" value={`${performance}%`} caption="Rispetto agli obiettivi" icon={Goal} tone="green" />
      </div>

      <div className="page-card module-card">
        <div className="module-toolbar module-toolbar--marketing">
          <div className="module-tabs module-tabs--compact"><button type="button" className={view === 'pipeline' ? 'is-active' : ''} onClick={() => setView('pipeline')}><BarChart3 size={17} /> Pipeline</button><button type="button" className={view === 'planning' ? 'is-active' : ''} onClick={() => setView('planning')}><CalendarRange size={17} /> Pianificazione</button></div>
          <label className="module-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca campagna…" /></label>
          <select className="module-select" value={channel} onChange={(event) => setChannel(event.target.value)}><option>Tutti i canali</option>{channels.map((item) => <option key={item}>{item}</option>)}</select>
        </div>

        {view === 'pipeline' ? <div className="marketing-pipeline">
          {statuses.map((status) => {
            const column = campaigns.filter((item) => item.status === status)
            return <div className="marketing-column" key={status}>
              <div className="marketing-column__head"><span className={`module-dot is-${campaignTone(status)}`} /><strong>{status}</strong><span>{column.length}</span></div>
              <div className="marketing-column__body">
                {column.map((campaign) => {
                  const progress = campaign.goal ? Math.min(100, Math.round((campaign.leads / campaign.goal) * 100)) : 0
                  const spentProgress = campaign.budget ? Math.min(100, Math.round((campaign.spent / campaign.budget) * 100)) : 0
                  return <article className="campaign-card" key={campaign.id}>
                    <div className="campaign-card__head"><span>{campaign.channel}</span><button className="module-icon-button" type="button" onClick={() => editCampaign(campaign)} aria-label="Modifica"><Pencil size={15} /></button></div>
                    <h4>{campaign.name}</h4><p>{campaign.objective}</p>
                    <div className="campaign-card__dates"><CalendarRange size={15} /> {formatItalianDate(campaign.startDate, { year: undefined })} – {formatItalianDate(campaign.endDate, { year: undefined })}</div>
                    <div className="module-progress-label"><span>Obiettivo</span><strong>{campaign.leads} / {campaign.goal}</strong></div><div className="module-progress"><i style={{ width: `${progress}%` }} /></div>
                    <div className="campaign-card__budget"><span><small>Budget</small><strong>{formatCurrency(campaign.budget)}</strong></span><span><small>Utilizzato</small><strong>{spentProgress}%</strong></span></div>
                    <div className="campaign-card__footer"><span>{campaign.owner || 'Non assegnata'}</span><select value={campaign.status} onChange={(event) => updateStatus(campaign, event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
                  </article>
                })}
                {!column.length ? <div className="marketing-column__empty">Nessuna campagna</div> : null}
              </div>
            </div>
          })}
        </div> : <div className="campaign-planning">
          <div className="campaign-planning__head"><div><h3>Piano campagne</h3><p>Ordine cronologico delle attività programmate.</p></div><span className="module-badge is-blue">{campaigns.length} campagne</span></div>
          {campaigns.sort((a, b) => a.startDate.localeCompare(b.startDate)).map((campaign) => {
            const duration = Math.max(1, Math.round((new Date(campaign.endDate) - new Date(campaign.startDate)) / 86400000) + 1)
            return <article className="campaign-timeline-row" key={campaign.id}>
              <div className={`campaign-timeline-row__marker is-${campaignTone(campaign.status)}`}><Target size={18} /></div>
              <div className="campaign-timeline-row__content"><div><span className={`module-badge is-${campaignTone(campaign.status)}`}>{campaign.status}</span><h4>{campaign.name}</h4><p>{campaign.objective}</p></div><div className="campaign-timeline-row__meta"><span><CalendarRange size={15} /> {formatItalianDate(campaign.startDate)} – {formatItalianDate(campaign.endDate)}</span><span>{duration} giorni · {campaign.channel} · {campaign.owner || 'Da assegnare'}</span></div></div>
              <div className="campaign-timeline-row__actions"><button className="module-icon-button" type="button" onClick={() => editCampaign(campaign)}><Pencil size={16} /></button><button className="module-icon-button is-danger" type="button" onClick={() => removeCampaign(campaign)}><Trash2 size={16} /></button></div>
            </article>
          })}
          {!campaigns.length ? <ModuleEmpty icon={Sparkles} title="Nessuna campagna pianificata" text="Crea la prima campagna e definisci le date di pubblicazione." /> : null}
        </div>}
      </div>

      <ModuleModal open={open} onClose={() => setOpen(false)} title={editingId ? 'Modifica campagna' : 'Pianifica campagna'} subtitle="Definisci obiettivo, periodo, budget e responsabilità." icon={Megaphone} size="large">
        <form className="module-form" onSubmit={submit}>
          <label className="module-field module-field--full">Nome campagna<span>*</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Es. Lancio nuova stagione" /></label>
          <label className="module-field module-field--full">Obiettivo<span>*</span><input required value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Cosa vuoi ottenere?" /></label>
          <label className="module-field">Canale<select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>{channels.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Responsabile<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Nome o team" /></label>
          <label className="module-field">Data inizio<span>*</span><input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
          <label className="module-field">Data fine<span>*</span><input type="date" min={form.startDate} required value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
          <label className="module-field">Budget (€)<input type="number" min="0" step="0.01" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></label>
          <label className="module-field">Spesa attuale (€)<input type="number" min="0" step="0.01" value={form.spent} onChange={(event) => setForm({ ...form, spent: event.target.value })} /></label>
          <label className="module-field">Lead ottenuti<input type="number" min="0" value={form.leads} onChange={(event) => setForm({ ...form, leads: event.target.value })} /></label>
          <label className="module-field">Obiettivo lead<input type="number" min="0" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} /></label>
          <label className="module-field module-field--full">Stato<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="module-form__actions"><button type="button" className="module-button" onClick={() => setOpen(false)}>Annulla</button>{editingId ? <button type="button" className="module-button module-button--danger" onClick={() => { removeCampaign({ ...form, id: editingId }); setOpen(false) }}><Trash2 size={16} /> Elimina</button> : null}<button className="module-button module-button--primary">{editingId ? 'Salva modifiche' : 'Pianifica campagna'}</button></div>
        </form>
      </ModuleModal>
    </section>
  )
}
