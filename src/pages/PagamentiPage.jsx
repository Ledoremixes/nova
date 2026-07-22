import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Euro,
  Eye,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRoundCheck,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react'
import '../styles/PagamentiPage.css'
import { fetchOrchideaCourses } from '../api/orchideaEntities'
import { euro, fetchAllieviPaymentsMonth, setAllievoMonthlyPayment } from '../api/orchideaPayments'

const currentMonth = dayjs().format('YYYY-MM')

function initials(row) {
  return String(row.nomeCompleto || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'
}

function monthLabel(month) {
  const [year, monthNumber] = String(month || currentMonth).split('-').map(Number)
  const date = new Date(year || new Date().getFullYear(), (monthNumber || 1) - 1, 1)
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(date)
}

function statusLabel(status) {
  if (status === 'pagato') return 'Pagato'
  if (status === 'parziale') return 'Parziale'
  if (status === 'sospeso') return 'Sospeso/chiuso'
  return 'Da pagare'
}

function statusClass(status) {
  if (status === 'pagato') return 'payments-student-status payments-student-status--paid'
  if (status === 'parziale') return 'payments-student-status payments-student-status--partial'
  if (status === 'sospeso') return 'payments-student-status payments-student-status--paused'
  return 'payments-student-status payments-student-status--due'
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '—'
}

function parseAmount(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function paymentHeadline(row) {
  if (row.stato_pagamento === 'pagato') return 'Quota coperta per intero'
  if (row.stato_pagamento === 'parziale') return `${euro(row.residuo)} ancora da incassare`
  if (row.stato_pagamento === 'sospeso') return 'Quota sospesa: non genera residuo operativo'
  return `${euro(row.quota_mese)} da incassare`
}

export default function PagamentiPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth)
  const [courseId, setCourseId] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('Contanti')
  const [selectedRow, setSelectedRow] = useState(null)
  const [paymentEditor, setPaymentEditor] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Contanti')
  const [feedback, setFeedback] = useState('')

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-payments'],
    queryFn: fetchOrchideaCourses,
  })

  const paymentsQuery = useQuery({
    queryKey: ['orchidea-allievi-payments', { month, search, courseId, status }],
    queryFn: () => fetchAllieviPaymentsMonth({ month, search, courseId, status }),
  })

  const setPaymentMutation = useMutation({
    mutationFn: setAllievoMonthlyPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
      setPaymentEditor(null)
      setSelectedRow(null)
    },
  })

  const rows = useMemo(() => paymentsQuery.data || [], [paymentsQuery.data])
  const courses = coursesQuery.data || []

  const summary = useMemo(() => rows.reduce((acc, row) => {
    acc.count += 1
    acc.totalDue += Number(row.quota_mese || 0)
    acc.paid += Number(row.pagato || 0)
    acc.residue += Number(row.residuo || 0)
    if (row.stato_pagamento === 'pagato') acc.paidCount += 1
    if (row.stato_pagamento === 'parziale') acc.partialCount += 1
    if (row.stato_pagamento === 'sospeso') acc.pausedCount += 1
    if (row.stato_pagamento === 'da_pagare' || row.stato_pagamento === 'parziale') acc.dueCount += 1
    return acc
  }, { count: 0, totalDue: 0, paid: 0, residue: 0, paidCount: 0, partialCount: 0, dueCount: 0, pausedCount: 0 }), [rows])

  const activeFilters = Number(courseId !== 'all') + Number(status !== 'all') + Number(Boolean(search.trim()))
  const editorAmount = parseAmount(paymentAmount)
  const editorPaidAfter = paymentEditor ? Math.min(Number(paymentEditor.pagato || 0) + editorAmount, Number(paymentEditor.quota_mese || 0)) : 0
  const editorResidueAfter = paymentEditor ? Math.max(Number(paymentEditor.quota_mese || 0) - editorPaidAfter, 0) : 0
  const editorError = paymentEditor && (editorAmount <= 0 || editorAmount > Number(paymentEditor.residuo || 0) + 0.001)

  function changeMonth(delta) {
    setMonth(dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM'))
  }

  function clearFilters() {
    setSearch('')
    setCourseId('all')
    setStatus('all')
  }

  function openPaymentEditor(row) {
    setFeedback('')
    setPaymentEditor(row)
    setPaymentAmount(Number(row.residuo || row.quota_mese || 0).toFixed(2))
    setPaymentMethod(row.metodo_pagamento || method)
    setPaymentNote('')
  }

  function submitPayment(event) {
    event.preventDefault()
    if (!paymentEditor || editorError) return
    const cumulativeAmount = Math.round((Number(paymentEditor.pagato || 0) + editorAmount) * 100) / 100
    setFeedback('')
    setPaymentMutation.mutate({
      tesseramentoId: paymentEditor.tesseramento_id,
      month,
      amount: cumulativeAmount,
      status: 'pagato',
      method: paymentMethod,
      note: paymentNote.trim() || `Incasso ${euro(editorAmount)} registrato da Nova`,
    }, {
      onSuccess: () => setFeedback(`Pagamento di ${euro(editorAmount)} registrato per ${paymentEditor.nomeCompleto}.`),
    })
  }

  function markDue(row) {
    const message = row.pagato > 0
      ? `Riaprire il pagamento di ${row.nomeCompleto}? L'importo registrato per ${monthLabel(month)} tornerà a 0,00 €.`
      : `Impostare ${row.nomeCompleto} come da pagare?`
    if (!window.confirm(message)) return
    setFeedback('')
    setPaymentMutation.mutate({
      tesseramentoId: row.tesseramento_id,
      month,
      amount: 0,
      status: 'da_pagare',
      method: row.metodo_pagamento || method,
      note: 'Pagamento riaperto e saldo mensile azzerato da Nova',
    }, {
      onSuccess: () => setFeedback(`Pagamento riaperto per ${row.nomeCompleto}: residuo ripristinato a ${euro(row.quota_mese)}.`),
    })
  }

  function markPaused(row) {
    if (!window.confirm(`Sospendere la quota di ${row.nomeCompleto} per ${monthLabel(month)}?`)) return
    setFeedback('')
    setPaymentMutation.mutate({
      tesseramentoId: row.tesseramento_id,
      month,
      amount: 0,
      status: 'sospeso',
      method: row.metodo_pagamento || method,
      note: 'Quota mensile sospesa/chiusa da Nova',
    }, {
      onSuccess: () => setFeedback(`Quota sospesa per ${row.nomeCompleto}.`),
    })
  }

  return (
    <section className="payments-page payments-students-page">
      <div className="payments-students-hero">
        <div>
          <div className="payments-students-eyebrow">Segreteria pagamenti</div>
          <h1>Quote allievi di {monthLabel(month)}</h1>
          <p>Ogni allievo ha un solo saldo mensile autorevole. Aggiunte di corsi, riaperture e pagamenti parziali vengono ricalcolati senza sommare vecchi duplicati.</p>
        </div>
        <span className="payments-students-hero-pill"><WalletCards size={17} /> Saldi controllati</span>
      </div>

      <div className="payments-summary-grid payments-student-summary-grid">
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><UserRoundCheck size={20} /></div>
          <div><span className="payments-summary-label">Allievi/pacchetti</span><strong>{summary.count}</strong><small>nel mese selezionato</small></div>
        </div>
        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--gold">
          <div className="payments-summary-icon"><Euro size={20} /></div>
          <div className="payments-summary-main">
            <span className="payments-summary-label">Da incassare</span>
            <strong className="payments-summary-amount">{euro(summary.residue)}</strong>
            <div className="payments-summary-detail">
              <span className="payments-summary-count">{summary.dueCount}</span>
              <small>{summary.dueCount === 1 ? 'saldo aperto' : 'saldi aperti'}</small>
            </div>
          </div>
        </div>
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><CheckCircle2 size={20} /></div>
          <div><span className="payments-summary-label">Incassato</span><strong>{euro(summary.paid)}</strong><small>{summary.paidCount} coperti · {summary.partialCount} parziali</small></div>
        </div>
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><XCircle size={20} /></div>
          <div><span className="payments-summary-label">Sospesi/chiusi</span><strong>{summary.pausedCount}</strong><small>fuori dal residuo operativo</small></div>
        </div>
      </div>

      <div className="payments-filter-panel">
        <div className="payments-filter-panel__head">
          <div>
            <span className="payments-filter-icon"><SlidersHorizontal size={18} /></span>
            <div><strong>Ricerca e filtri</strong><small>Trova rapidamente un allievo e lavora sul mese corretto.</small></div>
          </div>
          <button type="button" className="payments-clear-filters" onClick={clearFilters} disabled={!activeFilters}>
            <RotateCcw size={15} /> Azzera filtri {activeFilters ? `(${activeFilters})` : ''}
          </button>
        </div>

        <div className="payments-filter-primary-row">
          <div className="payments-month-selector">
            <span>Mese di competenza</span>
            <div>
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Mese precedente"><ChevronLeft size={18} /></button>
              <label>
                <CalendarDays size={18} />
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              </label>
              <button type="button" onClick={() => changeMonth(1)} aria-label="Mese successivo"><ChevronRight size={18} /></button>
            </div>
            <small>{monthLabel(month)}</small>
          </div>

          <label className="payments-search-modern">
            <span>Cerca allievo</span>
            <div><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, email, codice fiscale o tessera…" /></div>
          </label>
        </div>

        <div className="payments-filter-secondary-row">
          <div className="payments-status-filter">
            <span>Stato pagamento</span>
            <div>
              {[
                ['all', 'Tutti'],
                ['da_pagare', 'Da pagare'],
                ['parziale', 'Parziali'],
                ['pagato', 'Pagati'],
                ['sospeso', 'Sospesi'],
              ].map(([value, label]) => (
                <button type="button" className={status === value ? 'active' : ''} onClick={() => setStatus(value)} key={value}>{label}</button>
              ))}
            </div>
          </div>

          <label className="payments-select-modern">
            <span>Corso</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="all">Tutti i corsi</option>
              {courses.map((course) => <option value={course.id} key={course.id}>{course.nome}</option>)}
            </select>
          </label>

          <label className="payments-select-modern">
            <span>Metodo predefinito</span>
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              <option>Contanti</option>
              <option>Bonifico</option>
              <option>Carta</option>
              <option>POS</option>
            </select>
          </label>
        </div>
      </div>

      {feedback ? <div className="payments-feedback"><Check size={17} /> {feedback}</div> : null}
      {setPaymentMutation.error ? <div className="form-error">Errore salvataggio: {setPaymentMutation.error.message}</div> : null}
      {paymentsQuery.isLoading ? <div className="payments-empty-state">Caricamento quote allievi…</div> : null}
      {paymentsQuery.error ? <div className="form-error">Errore: {paymentsQuery.error.message}</div> : null}
      {!paymentsQuery.isLoading && !paymentsQuery.error && rows.length === 0 ? (
        <div className="payments-empty-state payments-student-empty">Nessuna quota trovata per i filtri selezionati.</div>
      ) : null}

      <div className="payments-student-list payments-student-list--compact">
        {rows.map((row) => (
          <article className={`payments-student-card payments-student-card--compact payments-student-card--${row.stato_pagamento}`} key={row.tesseramento_id}>
            <div className="payments-student-card__top">
              <div className="payments-student-person">
                <span className="payments-student-avatar">{initials(row)}</span>
                <div>
                  <h3>{row.nomeCompleto}</h3>
                  <p>{row.numero_tessera || row.email || 'Tessera non indicata'}</p>
                </div>
              </div>
              <span className={statusClass(row.stato_pagamento)}>{statusLabel(row.stato_pagamento)}</span>
            </div>

            <div className="payments-compact-package-row">
              <span className="payments-package-pill">{row.tipo_pacchetto}</span>
              <div className="payments-course-chips payments-course-chips--compact">
                {row.corsi.slice(0, 2).map((course) => <em key={course.id || course.nome}>{course.nome || 'Corso'}</em>)}
                {row.corsi.length > 2 ? <em>+{row.corsi.length - 2}</em> : null}
              </div>
            </div>

            <div className="payments-compact-balance">
              <div><span>Quota</span><strong>{euro(row.quota_mese)}</strong></div>
              <div><span>Incassato</span><strong>{euro(row.pagato)}</strong></div>
              <div className={row.residuo > 0 ? 'is-due' : 'is-ok'}><span>Residuo</span><strong>{euro(row.residuo)}</strong></div>
            </div>

            <div className="payments-compact-statusline">{paymentHeadline(row)}</div>

            <div className="payments-student-actions payments-student-actions--compact">
              {row.stato_pagamento === 'pagato' ? (
                <button type="button" className="payments-paid-btn" disabled><CheckCircle2 size={17} /> Pagamento registrato</button>
              ) : row.stato_pagamento === 'sospeso' ? null : (
                <button type="button" className="payments-primary-btn" disabled={setPaymentMutation.isPending || row.residuo <= 0} onClick={() => openPaymentEditor(row)}>
                  <CreditCard size={17} /> {row.stato_pagamento === 'parziale' ? 'Incassa residuo' : 'Registra pagamento'}
                </button>
              )}

              {(row.stato_pagamento === 'pagato' || row.stato_pagamento === 'parziale' || row.stato_pagamento === 'sospeso') ? (
                <button type="button" className="payments-secondary-btn" disabled={setPaymentMutation.isPending} onClick={() => markDue(row)}>
                  <RotateCcw size={16} /> Riapri pagamento
                </button>
              ) : (
                <button type="button" className="payments-secondary-btn payments-secondary-btn--muted" disabled={setPaymentMutation.isPending} onClick={() => markPaused(row)}>
                  Sospendi/chiudi
                </button>
              )}

              <button type="button" className="payments-detail-btn" onClick={() => setSelectedRow(row)}><Eye size={16} /> Dettagli</button>
            </div>
          </article>
        ))}
      </div>

      {paymentEditor ? (
        <div className="payments-modal-overlay" onClick={() => setPaymentEditor(null)}>
          <form className="payments-modal payments-register-modal" onSubmit={submitPayment} onClick={(event) => event.stopPropagation()}>
            <div className="payments-modal-header">
              <div><span className="payments-modal-eyebrow">Registra incasso</span><h2>{paymentEditor.nomeCompleto}</h2><p>{monthLabel(month)} · residuo attuale {euro(paymentEditor.residuo)}</p></div>
              <button type="button" className="payments-close-btn" onClick={() => setPaymentEditor(null)}><X size={18} /></button>
            </div>

            <div className="payments-register-summary">
              <div><span>Quota mese</span><strong>{euro(paymentEditor.quota_mese)}</strong></div>
              <div><span>Già incassato</span><strong>{euro(paymentEditor.pagato)}</strong></div>
              <div><span>Residuo</span><strong>{euro(paymentEditor.residuo)}</strong></div>
            </div>

            <div className="payments-form-grid">
              <label className="payments-form-field">
                <span>Importo incassato adesso</span>
                <input type="number" min="0.01" max={paymentEditor.residuo} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} autoFocus />
                {editorError ? <small className="payments-inline-error">Inserisci un importo tra 0,01 € e {euro(paymentEditor.residuo)}.</small> : null}
              </label>
              <label className="payments-form-field">
                <span>Metodo di incasso</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option>Contanti</option><option>Bonifico</option><option>Carta</option><option>POS</option>
                </select>
              </label>
              <label className="payments-form-field payments-form-field-full">
                <span>Nota facoltativa</span>
                <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Esempio: saldo aggiunta corso Bachata Fusion" />
              </label>
            </div>

            <div className="payments-register-result">
              <span>Dopo il salvataggio</span>
              <strong>{euro(editorPaidAfter)} incassati · {euro(editorResidueAfter)} residui</strong>
            </div>

            <div className="payments-form-actions">
              <button type="button" className="payments-secondary-btn" onClick={() => setPaymentEditor(null)}>Annulla</button>
              <button type="submit" className="payments-primary-btn" disabled={Boolean(editorError) || setPaymentMutation.isPending}>
                <CreditCard size={17} /> {setPaymentMutation.isPending ? 'Salvataggio…' : 'Conferma incasso'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedRow ? (
        <div className="payments-modal-overlay" onClick={() => setSelectedRow(null)}>
          <div className="payments-modal payments-student-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="payments-modal-header">
              <div><span className="payments-modal-eyebrow">Dettaglio quota</span><h2>{selectedRow.nomeCompleto}</h2><p>{selectedRow.numero_tessera || selectedRow.email || 'Tessera non indicata'} · {monthLabel(month)}</p></div>
              <button type="button" className="payments-close-btn" onClick={() => setSelectedRow(null)}><X size={18} /></button>
            </div>

            <div className="payments-student-card__badges payments-detail-badges">
              <span className="payments-package-pill">{selectedRow.tipo_pacchetto}</span>
              <span className={statusClass(selectedRow.stato_pagamento)}>{statusLabel(selectedRow.stato_pagamento)}</span>
            </div>

            <div className="payments-student-alert">
              <span>Saldo mensile</span>
              <strong>{paymentHeadline(selectedRow)}</strong>
            </div>

            <div className="payments-student-info-grid">
              <div><span>Pacchetto</span><strong>{selectedRow.tipo_pacchetto}</strong><small>{selectedRow.corsi.length} corsi inclusi</small><div className="payments-course-chips">{selectedRow.corsi.map((course) => <em key={course.id || course.nome}>{course.nome || 'Corso'}</em>)}</div></div>
              <div><span>Formula</span><strong>{selectedRow.formula}</strong><small>totale mensile del pacchetto</small></div>
              <div><span>Copertura</span><strong>{formatDate(selectedRow.copertura_dal)}</strong><small>fino al {formatDate(selectedRow.copertura_al)}</small></div>
              <div><span>Quota pacchetto</span><strong>{euro(selectedRow.quota_mese)}</strong><small>competenza {monthLabel(month)}</small></div>
              <div><span>Saldo registrato</span><strong>{euro(selectedRow.pagato)}</strong><small>{selectedRow.metodo_pagamento || 'Metodo non indicato'}{selectedRow.data_pagamento ? ` · ${formatDate(selectedRow.data_pagamento)}` : ''}</small></div>
            </div>

            <div className="payments-ledger-note">
              <strong>Controllo contabile Nova</strong>
              <p>Saldo calcolato da un unico record mensile autorevole. {selectedRow.payment_source === 'legacy' ? 'I vecchi record sono stati normalizzati senza duplicare gli importi.' : 'Eventuali vecchie righe per-corso non vengono sommate due volte.'}</p>
              {selectedRow.nota_pagamento ? <small>Nota: {selectedRow.nota_pagamento}</small> : null}
              {selectedRow.payment_ignored_excess > 0 ? <small>Eccedenza duplicata ignorata: {euro(selectedRow.payment_ignored_excess)}</small> : null}
            </div>

            <div className="payments-student-actions">
              {selectedRow.stato_pagamento !== 'pagato' && selectedRow.stato_pagamento !== 'sospeso' ? <button type="button" className="payments-primary-btn" onClick={() => { setSelectedRow(null); openPaymentEditor(selectedRow) }}><CreditCard size={17} /> Registra incasso</button> : null}
              {selectedRow.stato_pagamento !== 'da_pagare' ? <button type="button" className="payments-secondary-btn" onClick={() => markDue(selectedRow)}><RotateCcw size={16} /> Riapri pagamento</button> : null}
              <button type="button" className="payments-secondary-btn" onClick={() => setSelectedRow(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
