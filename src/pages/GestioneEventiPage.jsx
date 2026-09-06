import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  TicketCheck,
  Trash2,
  Users,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { createId, formatCurrency, formatItalianDate } from '../lib/novaModulesStore'
import { ModuleEmpty, ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

const emptyEvent = {
  title: '',
  category: 'Serata latina',
  date: '',
  startTime: '21:30',
  endTime: '02:00',
  venue: 'Orchidea Dancing Club',
  status: 'Bozza',
  capacity: 300,
  entries: 0,
  ticketPrice: 0,
  barRevenue: 0,
  costs: 0,
  description: '',
}

const statuses = ['Bozza', 'Pianificato', 'Confermato', 'Completato']
const categories = ['Serata latina', 'Serata country', 'Open day', 'Stage', 'Evento speciale', 'Altro']

function statusTone(status) {
  if (status === 'Confermato') return 'success'
  if (status === 'Completato') return 'neutral'
  if (status === 'Pianificato') return 'blue'
  return 'warning'
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasDetailedEconomics(item = {}) {
  return ['entries', 'ticketPrice', 'barRevenue', 'costs'].some((key) => item[key] !== undefined && item[key] !== null)
}

function eventEconomics(item = {}) {
  const detailed = hasDetailedEconomics(item)
  const entries = numberValue(detailed ? item.entries : item.registered)
  const costs = numberValue(detailed ? item.costs : item.budget)

  if (!detailed) {
    const grossRevenue = numberValue(item.revenue)
    return {
      entries,
      ticketPrice: entries > 0 && grossRevenue > 0 ? grossRevenue / entries : 0,
      ticketRevenue: grossRevenue,
      barRevenue: 0,
      costs,
      grossRevenue,
      netRevenue: grossRevenue - costs,
    }
  }

  const ticketPrice = numberValue(item.ticketPrice)
  const barRevenue = numberValue(item.barRevenue)
  const ticketRevenue = entries * ticketPrice
  const grossRevenue = ticketRevenue + barRevenue
  return {
    entries,
    ticketPrice,
    ticketRevenue,
    barRevenue,
    costs,
    grossRevenue,
    netRevenue: grossRevenue - costs,
  }
}

function editorEvent(item = {}) {
  const economics = eventEconomics(item)
  return {
    ...emptyEvent,
    ...item,
    entries: economics.entries,
    ticketPrice: Number(economics.ticketPrice.toFixed(2)),
    barRevenue: economics.barRevenue,
    costs: economics.costs,
  }
}

export default function GestioneEventiPage() {
  const { data, commit } = useNovaModules()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Tutti')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyEvent)

  const events = useMemo(() => data.events
    .filter((item) => status === 'Tutti' || item.status === status)
    .filter((item) => `${item.title} ${item.category} ${item.venue}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.date.localeCompare(b.date)), [data.events, search, status])

  const totals = useMemo(() => data.events.reduce((acc, item) => {
    const economics = eventEconomics(item)
    acc.entries += economics.entries
    acc.gross += economics.grossRevenue
    acc.costs += economics.costs
    acc.net += economics.netRevenue
    return acc
  }, { entries: 0, gross: 0, costs: 0, net: 0 }), [data.events])

  const confirmed = data.events.filter((item) => item.status === 'Confermato').length
  const formEconomics = eventEconomics(form)

  function newEvent() {
    setEditingId(null)
    setForm({ ...emptyEvent })
    setOpen(true)
  }

  function editEvent(item) {
    setEditingId(item.id)
    setForm(editorEvent(item))
    setOpen(true)
  }

  function submit(event) {
    event.preventDefault()
    const economics = eventEconomics(form)
    const normalized = {
      ...form,
      capacity: numberValue(form.capacity),
      entries: economics.entries,
      ticketPrice: economics.ticketPrice,
      barRevenue: economics.barRevenue,
      costs: economics.costs,
      // Campi legacy mantenuti per compatibilità con dashboard/report già esistenti.
      registered: economics.entries,
      budget: economics.costs,
      revenue: economics.grossRevenue,
      netRevenue: economics.netRevenue,
    }

    if (editingId) {
      commit(
        (current) => ({ ...current, events: current.events.map((item) => item.id === editingId ? { ...normalized, id: editingId } : item) }),
        { action: 'Evento aggiornato', module: 'Eventi', detail: `${normalized.title} · ${formatItalianDate(normalized.date)}`, severity: 'Successo' }
      )
    } else {
      const item = { ...normalized, id: createId('evt') }
      commit(
        (current) => ({ ...current, events: [...current.events, item] }),
        { action: 'Evento creato', module: 'Eventi', detail: `${item.title} · ${formatItalianDate(item.date)}`, severity: 'Successo' }
      )
    }
    setOpen(false)
  }

  function removeEvent(item) {
    if (!window.confirm(`Eliminare l’evento “${item.title}”?`)) return
    commit(
      (current) => ({ ...current, events: current.events.filter((event) => event.id !== item.id) }),
      { action: 'Evento eliminato', module: 'Eventi', detail: item.title, severity: 'Attenzione' }
    )
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Programmazione e risultati"
        title="Gestione eventi"
        description="Pianifica serate, registra ingressi, prezzo biglietto, incasso bar e costi: Nova calcola automaticamente ricavi lordi e netto della serata."
        icon={Sparkles}
      >
        <button className="module-button module-button--primary" type="button" onClick={newEvent}><Plus size={17} /> Crea evento</button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Eventi totali" value={data.events.length} caption={`${confirmed} confermati`} icon={CalendarDays} />
        <ModuleMetric label="Ingressi" value={totals.entries.toLocaleString('it-IT')} caption="Ingressi registrati" icon={Users} tone="blue" />
        <ModuleMetric label="Ricavi lordi" value={formatCurrency(totals.gross)} caption="Biglietti + bar" icon={TicketCheck} tone="green" />
        <ModuleMetric label="Ricavo netto" value={formatCurrency(totals.net)} caption={`${formatCurrency(totals.costs)} di costi`} icon={CircleDollarSign} tone={totals.net >= 0 ? 'green' : 'amber'} />
      </div>

      <div className="page-card module-card">
        <div className="module-toolbar">
          <label className="module-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca evento, categoria o luogo…" /></label>
          <select className="module-select" value={status} onChange={(event) => setStatus(event.target.value)}><option>Tutti</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        </div>

        {events.length ? <div className="event-grid">
          {events.map((item) => {
            const economics = eventEconomics(item)
            const percentage = item.capacity ? Math.min(100, Math.round((economics.entries / item.capacity) * 100)) : 0
            return (
              <article className="event-card" key={item.id}>
                <div className="event-card__date"><strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' })}</span></div>
                <div className="event-card__body">
                  <div className="event-card__top"><span className={`module-badge is-${statusTone(item.status)}`}>{item.status}</span><span className="module-kicker">{item.category}</span></div>
                  <h3>{item.title}</h3>
                  <div className="event-card__meta"><span><Clock3 size={15} /> {item.startTime} – {item.endTime}</span><span><MapPin size={15} /> {item.venue}</span></div>
                  <p>{item.description || 'Nessuna descrizione inserita.'}</p>
                  <div className="module-progress-label"><span>Ingressi</span><strong>{economics.entries} / {item.capacity}</strong></div>
                  <div className="module-progress"><i style={{ width: `${percentage}%` }} /></div>
                  <div className="event-economics-grid">
                    <div><small>Biglietti</small><strong>{formatCurrency(economics.ticketRevenue)}</strong><span>{economics.entries} × {formatCurrency(economics.ticketPrice)}</span></div>
                    <div><small>Bar</small><strong>{formatCurrency(economics.barRevenue)}</strong><span>Incasso registrato</span></div>
                    <div><small>Costi</small><strong>{formatCurrency(economics.costs)}</strong><span>Totale serata</span></div>
                    <div className={economics.netRevenue >= 0 ? 'is-positive' : 'is-negative'}><small>Netto</small><strong>{formatCurrency(economics.netRevenue)}</strong><span>Ricavi − costi</span></div>
                  </div>
                  <div className="event-card__footer event-card__footer--actions">
                    <div className="event-card__actions"><button className="module-icon-button" type="button" onClick={() => editEvent(item)} aria-label="Modifica"><Pencil size={17} /></button><button className="module-icon-button is-danger" type="button" onClick={() => removeEvent(item)} aria-label="Elimina"><Trash2 size={17} /></button></div>
                  </div>
                </div>
              </article>
            )
          })}
        </div> : <ModuleEmpty icon={CalendarDays} title="Nessun evento trovato" text="Modifica i filtri oppure crea il primo evento." />}
      </div>

      <ModuleModal open={open} onClose={() => setOpen(false)} title={editingId ? 'Modifica evento' : 'Nuovo evento'} subtitle="Inserisci i dati della serata: il risultato economico viene calcolato in tempo reale." icon={Sparkles} size="large">
        <form className="module-form" onSubmit={submit}>
          <label className="module-field module-field--full">Titolo<span>*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nome dell’evento" /></label>
          <label className="module-field">Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Stato<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Data<span>*</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <div className="module-field module-field--split"><label>Inizio<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label>Fine<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div>
          <label className="module-field module-field--full">Luogo<input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label>
          <label className="module-field">Capienza<input type="number" min="0" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
          <label className="module-field">Ingressi paganti<input type="number" min="0" value={form.entries} onChange={(event) => setForm({ ...form, entries: event.target.value })} /></label>
          <label className="module-field">Prezzo biglietto (€)<input type="number" min="0" step="0.01" value={form.ticketPrice} onChange={(event) => setForm({ ...form, ticketPrice: event.target.value })} /></label>
          <label className="module-field">Incasso bar (€)<input type="number" min="0" step="0.01" value={form.barRevenue} onChange={(event) => setForm({ ...form, barRevenue: event.target.value })} /></label>
          <label className="module-field module-field--full">Costi totali serata (€)<input type="number" min="0" step="0.01" value={form.costs} onChange={(event) => setForm({ ...form, costs: event.target.value })} placeholder="Personale, SIAE, cachet, forniture, sicurezza…" /></label>

          <div className="event-finance-preview module-field--full">
            <div><small>Ricavi biglietti</small><strong>{formatCurrency(formEconomics.ticketRevenue)}</strong><span>{formEconomics.entries} ingressi × {formatCurrency(formEconomics.ticketPrice)}</span></div>
            <div><small>Ricavi lordi</small><strong>{formatCurrency(formEconomics.grossRevenue)}</strong><span>Biglietti + bar</span></div>
            <div><small>Costi</small><strong>{formatCurrency(formEconomics.costs)}</strong><span>Totale uscite evento</span></div>
            <div className={formEconomics.netRevenue >= 0 ? 'is-positive' : 'is-negative'}><small>Ricavo netto</small><strong>{formatCurrency(formEconomics.netRevenue)}</strong><span>Ricavi lordi − costi</span></div>
          </div>

          <label className="module-field module-field--full">Descrizione<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Dettagli, programma, note organizzative…" /></label>
          <div className="module-form__actions"><button type="button" className="module-button" onClick={() => setOpen(false)}>Annulla</button><button className="module-button module-button--primary">{editingId ? 'Salva modifiche' : 'Crea evento'}</button></div>
        </form>
      </ModuleModal>
    </section>
  )
}
