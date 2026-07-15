import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  MapPin,
  Megaphone,
  PartyPopper,
  Plus,
  Trash2,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { createId, formatItalianDate } from '../lib/novaModulesStore'
import { ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const typeOptions = ['Appuntamento', 'Riunione', 'Scadenza', 'Marketing']

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildMonthDays(cursor) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const leading = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const total = Math.ceil((leading + daysInMonth) / 7) * 7

  return Array.from({ length: total }, (_, index) => {
    const value = new Date(year, month, index - leading + 1)
    return { value, key: dateKey(value), outside: value.getMonth() !== month }
  })
}

function entryTone(type) {
  if (type === 'Evento') return 'event'
  if (type === 'Marketing') return 'marketing'
  if (type === 'Scadenza') return 'deadline'
  if (type === 'Riunione') return 'meeting'
  return 'appointment'
}

const emptyForm = {
  title: '',
  date: '',
  time: '10:00',
  type: 'Appuntamento',
  location: '',
  notes: '',
}

export default function CalendarioPage() {
  const navigate = useNavigate()
  const { data, commit } = useNovaModules()
  const [cursor, setCursor] = useState(() => new Date())
  const [filter, setFilter] = useState('Tutti')
  const [form, setForm] = useState(emptyForm)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const entries = useMemo(() => {
    const appointments = data.calendarItems.map((item) => ({ ...item, source: 'calendar' }))
    const events = data.events.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      time: item.startTime,
      type: 'Evento',
      location: item.venue,
      notes: item.description,
      status: item.status,
      source: 'event',
    }))
    const campaigns = data.campaigns.map((item) => ({
      id: item.id,
      title: item.name,
      date: item.startDate,
      time: '',
      type: 'Marketing',
      location: item.channel,
      notes: item.objective,
      status: item.status,
      source: 'campaign',
    }))
    return [...appointments, ...events, ...campaigns].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [data.calendarItems, data.campaigns, data.events])

  const filteredEntries = filter === 'Tutti' ? entries : entries.filter((item) => item.type === filter)
  const monthDays = useMemo(() => buildMonthDays(cursor), [cursor])
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
  const monthEntries = filteredEntries.filter((entry) => entry.date.startsWith(monthPrefix))
  const today = dateKey(new Date())

  const calendarStats = {
    total: entries.filter((entry) => entry.date.startsWith(monthPrefix)).length,
    events: entries.filter((entry) => entry.date.startsWith(monthPrefix) && entry.type === 'Evento').length,
    deadlines: entries.filter((entry) => entry.date.startsWith(monthPrefix) && entry.type === 'Scadenza').length,
    marketing: entries.filter((entry) => entry.date.startsWith(monthPrefix) && entry.type === 'Marketing').length,
  }

  function changeMonth(offset) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function openNew(date = '') {
    setForm({ ...emptyForm, date })
    setOpen(true)
  }

  function submit(event) {
    event.preventDefault()
    const item = { ...form, id: createId('cal') }
    commit(
      (current) => ({ ...current, calendarItems: [...current.calendarItems, item] }),
      { action: 'Appuntamento creato', module: 'Calendario', detail: `${item.title} · ${formatItalianDate(item.date)}`, severity: 'Successo' }
    )
    setCursor(new Date(`${form.date}T12:00:00`))
    setOpen(false)
  }

  function removeSelected() {
    if (!selected || selected.source !== 'calendar') return
    if (!window.confirm(`Eliminare “${selected.title}”?`)) return
    commit(
      (current) => ({ ...current, calendarItems: current.calendarItems.filter((item) => item.id !== selected.id) }),
      { action: 'Appuntamento eliminato', module: 'Calendario', detail: selected.title, severity: 'Attenzione' }
    )
    setSelected(null)
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Organizzazione"
        title="Calendario"
        description="Una vista unica per appuntamenti, scadenze, eventi e campagne della scuola."
        icon={CalendarDays}
      >
        <button className="module-button module-button--primary" type="button" onClick={() => openNew(today)}>
          <Plus size={17} /> Nuovo appuntamento
        </button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Attività del mese" value={calendarStats.total} caption="Tutti gli elementi pianificati" icon={CalendarDays} />
        <ModuleMetric label="Eventi" value={calendarStats.events} caption="Eventi in calendario" icon={PartyPopper} tone="pink" />
        <ModuleMetric label="Scadenze" value={calendarStats.deadlines} caption="Adempimenti da ricordare" icon={Flag} tone="amber" />
        <ModuleMetric label="Marketing" value={calendarStats.marketing} caption="Campagne in partenza" icon={Megaphone} tone="blue" />
      </div>

      <div className="page-card module-calendar-card">
        <div className="module-toolbar module-toolbar--calendar">
          <div className="module-month-nav">
            <button className="module-icon-button" type="button" onClick={() => changeMonth(-1)} aria-label="Mese precedente"><ChevronLeft size={19} /></button>
            <div>
              <small>Vista mensile</small>
              <h3>{cursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h3>
            </div>
            <button className="module-icon-button" type="button" onClick={() => changeMonth(1)} aria-label="Mese successivo"><ChevronRight size={19} /></button>
            <button className="module-button module-button--soft" type="button" onClick={() => setCursor(new Date())}>Oggi</button>
          </div>
          <div className="module-segmented" aria-label="Filtra calendario">
            {['Tutti', 'Evento', 'Scadenza', 'Marketing'].map((item) => (
              <button key={item} type="button" className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        </div>

        <div className="module-calendar__desktop">
          <div className="module-calendar__weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="module-calendar__grid">
            {monthDays.map((day) => {
              const dayEntries = filteredEntries.filter((entry) => entry.date === day.key)
              return (
                <div
                  key={day.key}
                  className={`module-calendar__day ${day.outside ? 'is-outside' : ''} ${day.key === today ? 'is-today' : ''}`}
                  role="button"
                  tabIndex={day.outside ? -1 : 0}
                  onClick={() => !day.outside && openNew(day.key)}
                  onKeyDown={(event) => event.key === 'Enter' && !day.outside && openNew(day.key)}
                >
                  <span className="module-calendar__number">{day.value.getDate()}</span>
                  <div className="module-calendar__entries">
                    {dayEntries.slice(0, 3).map((entry) => (
                      <button
                        key={`${entry.source}-${entry.id}`}
                        type="button"
                        className={`module-calendar__entry is-${entryTone(entry.type)}`}
                        onClick={(event) => { event.stopPropagation(); setSelected(entry) }}
                      >
                        {entry.time ? <small>{entry.time}</small> : null}
                        <span>{entry.title}</span>
                      </button>
                    ))}
                    {dayEntries.length > 3 ? <small className="module-calendar__more">+{dayEntries.length - 3} altre</small> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="module-calendar__mobile-agenda">
          {monthEntries.length ? monthEntries.map((entry) => (
            <button key={`${entry.source}-${entry.id}`} type="button" className="module-agenda-row" onClick={() => setSelected(entry)}>
              <span className={`module-agenda-row__date is-${entryTone(entry.type)}`}>
                <strong>{new Date(`${entry.date}T12:00:00`).getDate()}</strong>
                <small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' })}</small>
              </span>
              <span><strong>{entry.title}</strong><small>{entry.time || entry.type} · {entry.location || 'Sede da definire'}</small></span>
              <ChevronRight size={18} />
            </button>
          )) : <div className="module-empty-inline">Nessuna attività per questo mese.</div>}
        </div>
      </div>

      <ModuleModal open={open} onClose={() => setOpen(false)} title="Nuovo appuntamento" subtitle="Aggiungi una nuova attività al calendario." icon={Plus}>
        <form className="module-form" onSubmit={submit}>
          <label className="module-field module-field--full">Titolo<span>*</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Es. Riunione insegnanti" /></label>
          <label className="module-field">Data<span>*</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label className="module-field">Ora<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
          <label className="module-field">Tipo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{typeOptions.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="module-field">Luogo<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Es. Ufficio" /></label>
          <label className="module-field module-field--full">Note<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Aggiungi dettagli utili…" /></label>
          <div className="module-form__actions"><button type="button" className="module-button" onClick={() => setOpen(false)}>Annulla</button><button className="module-button module-button--primary">Salva appuntamento</button></div>
        </form>
      </ModuleModal>

      <ModuleModal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} subtitle={selected?.type} icon={CalendarDays}>
        {selected ? <div className="module-detail">
          <div className="module-detail__row"><CalendarDays size={18} /><div><small>Data</small><strong>{formatItalianDate(selected.date)}</strong></div></div>
          {selected.time ? <div className="module-detail__row"><Clock3 size={18} /><div><small>Orario</small><strong>{selected.time}</strong></div></div> : null}
          <div className="module-detail__row"><MapPin size={18} /><div><small>Luogo / canale</small><strong>{selected.location || 'Da definire'}</strong></div></div>
          {selected.notes ? <div className="module-detail__note">{selected.notes}</div> : null}
          <div className="module-form__actions">
            {selected.source === 'calendar' ? <button className="module-button module-button--danger" type="button" onClick={removeSelected}><Trash2 size={16} /> Elimina</button> : null}
            {selected.source === 'event' ? <button className="module-button module-button--primary" type="button" onClick={() => navigate('/gestione-eventi')}>Apri gestione eventi</button> : null}
            {selected.source === 'campaign' ? <button className="module-button module-button--primary" type="button" onClick={() => navigate('/marketing')}>Apri marketing</button> : null}
          </div>
        </div> : null}
      </ModuleModal>
    </section>
  )
}
