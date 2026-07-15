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
  registered: 0,
  budget: 0,
  revenue: 0,
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

  const totalRegistered = data.events.reduce((sum, item) => sum + Number(item.registered || 0), 0)
  const totalRevenue = data.events.reduce((sum, item) => sum + Number(item.revenue || 0), 0)
  const totalBudget = data.events.reduce((sum, item) => sum + Number(item.budget || 0), 0)
  const confirmed = data.events.filter((item) => item.status === 'Confermato').length

  function newEvent() {
    setEditingId(null)
    setForm(emptyEvent)
    setOpen(true)
  }

  function editEvent(item) {
    setEditingId(item.id)
    setForm({ ...item })
    setOpen(true)
  }

  function submit(event) {
    event.preventDefault()
    const normalized = {
      ...form,
      capacity: Number(form.capacity || 0),
      registered: Number(form.registered || 0),
      budget: Number(form.budget || 0),
      revenue: Number(form.revenue || 0),
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
        description="Pianifica serate, stage e open day; tieni sotto controllo presenze, capienza, budget e incassi."
        icon={Sparkles}
      >
        <button className="module-button module-button--primary" type="button" onClick={newEvent}><Plus size={17} /> Crea evento</button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Eventi totali" value={data.events.length} caption={`${confirmed} confermati`} icon={CalendarDays} />
        <ModuleMetric label="Partecipanti" value={totalRegistered.toLocaleString('it-IT')} caption="Iscritti complessivi" icon={Users} tone="blue" />
        <ModuleMetric label="Incassi" value={formatCurrency(totalRevenue)} caption="Incassi registrati" icon={TicketCheck} tone="green" />
        <ModuleMetric label="Budget" value={formatCurrency(totalBudget)} caption="Budget pianificato" icon={CircleDollarSign} tone="amber" />
      </div>

      <div className="page-card module-card">
        <div className="module-toolbar">
          <label className="module-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca evento, categoria o luogo…" /></label>
          <select className="module-select" value={status} onChange={(event) => setStatus(event.target.value)}><option>Tutti</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        </div>

        {events.length ? <div className="event-grid">
          {events.map((item) => {
            const percentage = item.capacity ? Math.min(100, Math.round((item.registered / item.capacity) * 100)) : 0
            return (
              <article className="event-card" key={item.id}>
                <div className="event-card__date"><strong>{new Date(`${item.date}T12:00:00`).getDate()}</strong><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' })}</span></div>
                <div className="event-card__body">
                  <div className="event-card__top"><span className={`module-badge is-${statusTone(item.status)}`}>{item.status}</span><span className="module-kicker">{item.category}</span></div>
                  <h3>{item.title}</h3>
                  <div className="event-card__meta"><span><Clock3 size={15} /> {item.startTime} – {item.endTime}</span><span><MapPin size={15} /> {item.venue}</span></div>
                  <p>{item.description || 'Nessuna descrizione inserita.'}</p>
                  <div className="module-progress-label"><span>Partecipanti</span><strong>{item.registered} / {item.capacity}</strong></div>
                  <div className="module-progress"><i style={{ width: `${percentage}%` }} /></div>
                  <div className="event-card__footer">
                    <div><small>Incasso</small><strong>{formatCurrency(item.revenue)}</strong></div>
                    <div><small>Budget</small><strong>{formatCurrency(item.budget)}</strong></div>
                    <div className="event-card__actions"><button className="module-icon-button" type="button" onClick={() => editEvent(item)} aria-label="Modifica"><Pencil size={17} /></button><button className="module-icon-button is-danger" type="button" onClick={() => removeEvent(item)} aria-label="Elimina"><Trash2 size={17} /></button></div>
                  </div>
                </div>
              </article>
            )
          })}
        </div> : <ModuleEmpty icon={CalendarDays} title="Nessun evento trovato" text="Modifica i filtri oppure crea il primo evento." />}
      </div>

      <ModuleModal open={open} onClose={() => setOpen(false)} title={editingId ? 'Modifica evento' : 'Nuovo evento'} subtitle="Inserisci le informazioni operative ed economiche." icon={Sparkles} size="large">
        <form className="module-form" onSubmit={submit}>
          <label className="module-field module-field--full">Titolo<span>*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nome dell’evento" /></label>
          <label className="module-field">Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Stato<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Data<span>*</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <div className="module-field module-field--split"><label>Inizio<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label>Fine<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label></div>
          <label className="module-field module-field--full">Luogo<input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label>
          <label className="module-field">Capienza<input type="number" min="0" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
          <label className="module-field">Partecipanti<input type="number" min="0" value={form.registered} onChange={(event) => setForm({ ...form, registered: event.target.value })} /></label>
          <label className="module-field">Budget (€)<input type="number" min="0" step="0.01" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></label>
          <label className="module-field">Incasso (€)<input type="number" min="0" step="0.01" value={form.revenue} onChange={(event) => setForm({ ...form, revenue: event.target.value })} /></label>
          <label className="module-field module-field--full">Descrizione<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Dettagli, programma, note organizzative…" /></label>
          <div className="module-form__actions"><button type="button" className="module-button" onClick={() => setOpen(false)}>Annulla</button><button className="module-button module-button--primary">{editingId ? 'Salva modifiche' : 'Crea evento'}</button></div>
        </form>
      </ModuleModal>
    </section>
  )
}
