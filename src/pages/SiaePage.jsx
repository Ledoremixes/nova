import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Download,
  Euro,
  FileText,
  Pencil,
  Plus,
  ReceiptText,
  TicketCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  SIAE_DEFAULTS,
  SIAE_EVENT_PRESETS,
  calculateSiaeAmounts,
  createSiaeEvent,
  deleteSiaeEvent,
  fetchSiaeEvents,
  updateSiaeEvent,
} from '../api/siae'
import { downloadSiaeC1Event, downloadSiaeC1Month } from '../utils/siaeC1Pdf'
import '../styles/SiaePage.css'

function localDateValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentMonthValue() {
  return localDateValue().slice(0, 7)
}

function formatMoney(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function monthText(month) {
  const [year, number] = String(month || '').split('-')
  if (!year || !number) return 'Periodo'
  return new Date(Number(year), Number(number) - 1, 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  })
}

function createEmptyForm() {
  const preset = SIAE_EVENT_PRESETS.caraibica
  return {
    event_date: localDateValue(),
    event_time: preset.time,
    event_kind: 'caraibica',
    event_title: preset.title,
    admissions: '',
    unit_price: SIAE_DEFAULTS.unit_price,
    cancelled_tickets: 0,
    notes: '',
  }
}

function eventMonth(row) {
  return String(row.event_date || '').slice(0, 7)
}

export default function SiaePage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonthValue())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(createEmptyForm)
  const [formError, setFormError] = useState('')
  const [exportingKey, setExportingKey] = useState('')

  const query = useQuery({
    queryKey: ['siae-c1-events'],
    queryFn: fetchSiaeEvents,
  })

  const saveMutation = useMutation({
    mutationFn: (payload) => editing?.id
      ? updateSiaeEvent(editing.id, payload)
      : createSiaeEvent(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['siae-c1-events'] })
      setMonth(eventMonth(saved))
      closeModal()
    },
    onError: (error) => setFormError(error?.message || 'Impossibile salvare il modello C1.'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSiaeEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['siae-c1-events'] }),
    onError: (error) => window.alert(error?.message || 'Impossibile eliminare l’evento.'),
  })

  const allEvents = useMemo(() => query.data || [], [query.data])
  const monthEvents = useMemo(
    () => allEvents
      .filter((row) => eventMonth(row) === month)
      .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)) || String(a.event_time).localeCompare(String(b.event_time))),
    [allEvents, month]
  )

  const summary = useMemo(() => monthEvents.reduce((acc, row) => ({
    events: acc.events + 1,
    admissions: acc.admissions + Number(row.admissions || 0),
    gross: acc.gross + Number(row.gross_amount || 0),
    taxes: acc.taxes + Number(row.entertainment_tax || 0) + Number(row.vat_amount || 0),
  }), { events: 0, admissions: 0, gross: 0, taxes: 0 }), [monthEvents])

  const archive = useMemo(() => {
    const groups = new Map()
    allEvents.forEach((row) => {
      const key = eventMonth(row)
      const current = groups.get(key) || { month: key, rows: [], admissions: 0, gross: 0 }
      current.rows.push(row)
      current.admissions += Number(row.admissions || 0)
      current.gross += Number(row.gross_amount || 0)
      groups.set(key, current)
    })
    return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month))
  }, [allEvents])

  const liveAmounts = useMemo(
    () => calculateSiaeAmounts(form.admissions, form.unit_price),
    [form.admissions, form.unit_price]
  )

  function openNew() {
    const initial = createEmptyForm()
    initial.event_date = month ? `${month}-01` : localDateValue()
    setEditing(null)
    setForm(initial)
    setFormError('')
    setIsModalOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      event_date: String(row.event_date || '').slice(0, 10),
      event_time: String(row.event_time || '').slice(0, 5),
      event_kind: row.event_kind || 'custom',
      event_title: row.event_title || '',
      admissions: row.admissions,
      unit_price: row.unit_price,
      cancelled_tickets: row.cancelled_tickets || 0,
      notes: row.notes || '',
    })
    setFormError('')
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditing(null)
    setForm(createEmptyForm())
    setFormError('')
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function changePreset(kind) {
    const preset = SIAE_EVENT_PRESETS[kind] || SIAE_EVENT_PRESETS.custom
    setForm((current) => ({
      ...current,
      event_kind: kind,
      event_title: kind === 'custom' ? current.event_title : preset.title,
      event_time: preset.time,
    }))
  }

  function submit(event) {
    event.preventDefault()
    setFormError('')
    if (!form.event_date) return setFormError('Inserisci la data dell’evento.')
    if (!form.event_time) return setFormError('Inserisci l’orario di inizio.')
    if (Number(form.admissions) <= 0) return setFormError('Il numero degli ingressi deve essere maggiore di zero.')
    if (Number(form.unit_price) < 0) return setFormError('Il prezzo unitario non può essere negativo.')
    if (!String(form.event_title || '').trim()) return setFormError('Inserisci la descrizione dell’evento.')
    saveMutation.mutate(form)
  }

  function confirmDelete(row) {
    const confirmed = window.confirm(`Sei sicuro di voler eliminare il modello C1 del ${formatDate(row.event_date)} - ${row.event_title}?`)
    if (confirmed) deleteMutation.mutate(row.id)
  }

  async function exportSingle(row) {
    try {
      setExportingKey(row.id)
      await downloadSiaeC1Event(row)
    } catch (error) {
      window.alert(error?.message || 'Impossibile generare il PDF.')
    } finally {
      setExportingKey('')
    }
  }

  async function exportMonth(groupMonth = month, rows = monthEvents) {
    if (!rows.length) return window.alert('Nel mese selezionato non ci sono eventi da esportare.')
    try {
      setExportingKey(`month-${groupMonth}`)
      await downloadSiaeC1Month(rows, groupMonth)
    } catch (error) {
      window.alert(error?.message || 'Impossibile generare il PDF mensile.')
    } finally {
      setExportingKey('')
    }
  }

  return (
    <div className="siae-page">
      <section className="siae-hero">
        <div>
          <span className="siae-eyebrow">RIEPILOGHI FISCALI EVENTI</span>
          <h1>Modelli C1 SIAE</h1>
          <p>Inserisci data, tipologia e ingressi: Nova calcola automaticamente incasso lordo, imponibile, IVA al 22% e imposta sugli intrattenimenti al 16%.</p>
        </div>
        <button className="siae-primary" onClick={openNew}><Plus size={18} /> Nuovo modello C1</button>
      </section>

      <section className="siae-monthbar">
        <div>
          <label htmlFor="siae-month">Mese di competenza</label>
          <input id="siae-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <div className="siae-monthbar__title">
          <CalendarDays size={20} />
          <strong>{monthText(month)}</strong>
          <span>{monthEvents.length} {monthEvents.length === 1 ? 'evento' : 'eventi'}</span>
        </div>
        <button className="siae-secondary" disabled={!monthEvents.length || exportingKey === `month-${month}`} onClick={() => exportMonth()}>
          <Download size={18} /> {exportingKey === `month-${month}` ? 'Generazione…' : 'Scarica PDF del mese'}
        </button>
      </section>

      <section className="siae-stats">
        <article><span className="siae-stat-icon"><FileText size={20} /></span><div><small>Modelli nel mese</small><strong>{summary.events}</strong><p>Una pagina C1 per evento</p></div></article>
        <article><span className="siae-stat-icon"><TicketCheck size={20} /></span><div><small>Ingressi dichiarati</small><strong>{summary.admissions}</strong><p>Totale titoli emessi</p></div></article>
        <article><span className="siae-stat-icon"><Euro size={20} /></span><div><small>Incasso lordo</small><strong>{formatMoney(summary.gross)}</strong><p>Ingressi × prezzo unitario</p></div></article>
        <article><span className="siae-stat-icon"><ReceiptText size={20} /></span><div><small>IVA + ISI</small><strong>{formatMoney(summary.taxes)}</strong><p>Riepilogo fiscale calcolato</p></div></article>
      </section>

      {query.isError && (
        <div className="siae-error">
          <strong>Impossibile caricare lo storico SIAE.</strong>
          <span>{query.error?.message}</span>
          <small>Verifica di aver eseguito la migrazione <code>siae_c1_events.sql</code> nel progetto Supabase di Nova.</small>
        </div>
      )}

      <section className="siae-section">
        <header><div><span className="siae-eyebrow">EVENTI DEL MESE</span><h2>{monthText(month)}</h2></div></header>
        {query.isLoading ? <div className="siae-empty">Caricamento modelli C1…</div> : (
          <div className="siae-event-list">
            {monthEvents.map((row) => (
              <article className="siae-event" key={row.id}>
                <div className="siae-event__date"><strong>{String(row.event_date).slice(8, 10)}</strong><span>{new Date(`${row.event_date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' })}</span></div>
                <div className="siae-event__main">
                  <h3>{row.event_title}</h3>
                  <p>{formatDate(row.event_date)} alle {String(row.event_time || '').slice(0, 5)} · {formatMoney(row.unit_price)} a ingresso</p>
                  <div className="siae-event__chips"><span>{row.admissions} ingressi</span><span>{formatMoney(row.gross_amount)} lordo</span><span>{formatMoney(row.entertainment_tax)} ISI</span><span>{formatMoney(row.vat_amount)} IVA</span></div>
                </div>
                <div className="siae-event__actions">
                  <button onClick={() => exportSingle(row)} disabled={exportingKey === row.id}><Download size={16} /> {exportingKey === row.id ? 'Creo…' : 'PDF'}</button>
                  <button onClick={() => openEdit(row)}><Pencil size={16} /> Modifica</button>
                  <button className="danger" onClick={() => confirmDelete(row)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
            {!monthEvents.length && <div className="siae-empty">Nessun evento registrato per questo mese. Crea il primo modello C1 con il pulsante in alto.</div>}
          </div>
        )}
      </section>

      <section className="siae-section siae-archive">
        <header><div><span className="siae-eyebrow">ARCHIVIO RIGENERABILE</span><h2>Storico mensile</h2><p>I PDF non vengono salvati: Nova li ricrea in qualsiasi momento dai dati degli eventi.</p></div></header>
        <div className="siae-archive-grid">
          {archive.map((group) => (
            <article key={group.month}>
              <div><strong>{monthText(group.month)}</strong><span>{group.rows.length} modelli · {group.admissions} ingressi</span><small>{formatMoney(group.gross)} incasso lordo</small></div>
              <button onClick={() => exportMonth(group.month, group.rows)} disabled={exportingKey === `month-${group.month}`}><Download size={17} /> {exportingKey === `month-${group.month}` ? 'Creo…' : 'Scarica'}</button>
            </article>
          ))}
          {!archive.length && !query.isLoading && <div className="siae-empty">Lo storico si popolerà quando registrerai i primi eventi.</div>}
        </div>
      </section>

      {isModalOpen && (
        <div className="siae-modal" role="dialog" aria-modal="true" onClick={closeModal}>
          <div className="siae-modal__panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="siae-eyebrow">COMPILAZIONE AUTOMATICA</span><h2>{editing ? 'Modifica modello C1' : 'Nuovo modello C1'}</h2></div>
              <button onClick={closeModal} aria-label="Chiudi"><X size={20} /></button>
            </header>
            <form onSubmit={submit}>
              <section className="siae-form-grid">
                <label>Data evento<input type="date" value={form.event_date} onChange={(event) => updateField('event_date', event.target.value)} required /></label>
                <label>Tipologia evento<select value={form.event_kind} onChange={(event) => changePreset(event.target.value)}>{Object.entries(SIAE_EVENT_PRESETS).map(([value, preset]) => <option value={value} key={value}>{preset.label}</option>)}</select></label>
                <label>Ora inizio<input type="time" value={form.event_time} onChange={(event) => updateField('event_time', event.target.value)} required /></label>
                <label className="wide">Descrizione manifestazione<input value={form.event_title} onChange={(event) => updateField('event_title', event.target.value)} readOnly={form.event_kind !== 'custom'} required /></label>
                <label>Numero ingressi<input type="number" min="1" step="1" value={form.admissions} onChange={(event) => updateField('admissions', event.target.value)} placeholder="Es. 43" required /></label>
                <label>Prezzo unitario €<input type="number" min="0" step="0.01" value={form.unit_price} onChange={(event) => updateField('unit_price', event.target.value)} required /></label>
                <label>Titoli annullati<input type="number" min="0" step="1" value={form.cancelled_tickets} onChange={(event) => updateField('cancelled_tickets', event.target.value)} /></label>
                <label className="wide">Note interne<textarea rows="3" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Facoltative, non vengono stampate sul modello C1" /></label>
              </section>

              <section className="siae-calculation">
                <div><small>Incasso lordo</small><strong>{formatMoney(liveAmounts.gross_amount)}</strong><span>{liveAmounts.admissions} × {formatMoney(liveAmounts.unit_price)}</span></div>
                <div><small>Imponibile IVA</small><strong>{formatMoney(liveAmounts.taxable_amount)}</strong><span>Incasso lordo ÷ 1,38</span></div>
                <div><small>IVA 22%</small><strong>{formatMoney(liveAmounts.vat_amount)}</strong><span>Calcolata senza arrotondamenti intermedi</span></div>
                <div><small>ISI 16%</small><strong>{formatMoney(liveAmounts.entertainment_tax)}</strong><span>Imposta intrattenimenti</span></div>
              </section>

              {formError && <div className="siae-error compact">{formError}</div>}
              <footer><button type="button" className="siae-secondary" onClick={closeModal}>Annulla</button><button className="siae-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvataggio…' : 'Salva modello C1'}</button></footer>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
