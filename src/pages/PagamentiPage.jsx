import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { CalendarDays, CheckCircle2, CreditCard, Euro, Search, UserRoundCheck, XCircle } from 'lucide-react'
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
  if (status === 'sospeso') return 'Sospeso/chiuso'
  return 'Da pagare'
}

function statusClass(status) {
  if (status === 'pagato') return 'payments-student-status payments-student-status--paid'
  if (status === 'sospeso') return 'payments-student-status payments-student-status--paused'
  return 'payments-student-status payments-student-status--due'
}

function formatDate(value) {
  if (!value) return '—'
  return dayjs(value).format('DD/MM/YYYY')
}

export default function PagamentiPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth)
  const [courseId, setCourseId] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('Contanti')

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
    },
  })

  const rows = paymentsQuery.data || []
  const courses = coursesQuery.data || []

  const summary = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.count += 1
      acc.totalDue += Number(row.quota_mese || 0)
      acc.paid += Number(row.pagato || 0)
      acc.residue += Number(row.residuo || 0)
      if (row.stato_pagamento === 'pagato') acc.paidCount += 1
      if (row.stato_pagamento === 'sospeso') acc.pausedCount += 1
      if (row.stato_pagamento !== 'pagato' && row.stato_pagamento !== 'sospeso') acc.dueCount += 1
      return acc
    }, { count: 0, totalDue: 0, paid: 0, residue: 0, paidCount: 0, dueCount: 0, pausedCount: 0 })
  }, [rows])

  function markPaid(row) {
    setPaymentMutation.mutate({
      tesseramentoId: row.tesseramento_id,
      month,
      amount: row.quota_mese,
      status: 'pagato',
      method,
      note: 'Quota mensile segnata pagata da Nova',
    })
  }

  function markDue(row) {
    setPaymentMutation.mutate({
      tesseramentoId: row.tesseramento_id,
      month,
      amount: 0,
      status: 'da_pagare',
      method,
      note: 'Quota mensile rimessa da incassare da Nova',
    })
  }

  function markPaused(row) {
    setPaymentMutation.mutate({
      tesseramentoId: row.tesseramento_id,
      month,
      amount: 0,
      status: 'sospeso',
      method,
      note: 'Quota mensile sospesa/chiusa da Nova',
    })
  }

  return (
    <section className="payments-page payments-students-page">
      <div className="payments-students-hero">
        <div>
          <div className="payments-students-eyebrow">Segreteria pagamenti</div>
          <h1>Quote allievi di {monthLabel(month)}</h1>
          <p>Gestisci le quote mensili degli allievi come nel portale Orchidea Allievi: pacchetti multicorso raggruppati in una sola scheda, stato pagamento e residuo sempre visibili.</p>
        </div>
        <span className="payments-students-hero-pill">Quote aggiornate</span>
      </div>

      <div className="payments-summary-grid payments-student-summary-grid">
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><UserRoundCheck size={20} /></div>
          <div><span className="payments-summary-label">Allievi/pacchetti</span><strong>{summary.count}</strong><small>nel mese selezionato</small></div>
        </div>
        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--gold">
          <div className="payments-summary-icon"><Euro size={20} /></div>
          <div><span className="payments-summary-label">Da incassare</span><strong>{summary.dueCount}</strong><small>{euro(summary.residue)}</small></div>
        </div>
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><CheckCircle2 size={20} /></div>
          <div><span className="payments-summary-label">Pagati/coperti</span><strong>{summary.paidCount}</strong><small>{euro(summary.paid)} quota mese</small></div>
        </div>
        <div className="payments-summary-card payments-student-summary-card">
          <div className="payments-summary-icon"><XCircle size={20} /></div>
          <div><span className="payments-summary-label">Sospesi/chiusi</span><strong>{summary.pausedCount}</strong><small>nessuna quota futura</small></div>
        </div>
      </div>

      <div className="payments-filters-card payments-student-filters">
        <div className="payments-filter-field">
          <label>Mese</label>
          <div className="payments-month-wrap">
            <CalendarDays size={16} />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>

        <div className="payments-filter-field">
          <label>Corso</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="all">Tutti i corsi</option>
            {courses.map((course) => (
              <option value={course.id} key={course.id}>{course.nome}</option>
            ))}
          </select>
        </div>

        <div className="payments-filter-field">
          <label>Stato</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tutti</option>
            <option value="da_pagare">Da pagare</option>
            <option value="pagato">Pagato</option>
            <option value="sospeso">Sospeso/chiuso</option>
          </select>
        </div>

        <div className="payments-filter-field payments-search-field">
          <label>Cerca allievo</label>
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, email, CF, tessera…" />
        </div>

        <div className="payments-filter-field">
          <label>Metodo incasso</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Contanti</option>
            <option>Bonifico</option>
            <option>Carta</option>
            <option>POS</option>
          </select>
        </div>
      </div>

      {paymentsQuery.isLoading ? <div className="payments-empty-state">Caricamento quote allievi…</div> : null}
      {paymentsQuery.error ? <div className="form-error">Errore: {paymentsQuery.error.message}</div> : null}
      {!paymentsQuery.isLoading && !paymentsQuery.error && rows.length === 0 ? (
        <div className="payments-empty-state payments-student-empty">Nessuna quota trovata per i filtri selezionati.</div>
      ) : null}

      <div className="payments-student-list">
        {rows.map((row) => (
          <article className={`payments-student-card payments-student-card--${row.stato_pagamento}`} key={row.tesseramento_id}>
            <div className="payments-student-card__top">
              <div className="payments-student-person">
                <span className="payments-student-avatar">{initials(row)}</span>
                <div>
                  <h3>{row.nomeCompleto}</h3>
                  <p>{row.numero_tessera || row.email || 'Tessera non indicata'}</p>
                </div>
              </div>
              <div className="payments-student-card__badges">
                <span className="payments-package-pill">{row.tipo_pacchetto}</span>
                <span className={statusClass(row.stato_pagamento)}>{statusLabel(row.stato_pagamento)}</span>
              </div>
            </div>

            <div className="payments-student-alert">
              <span>{row.stato_pagamento === 'pagato' ? 'Quota coperta' : row.stato_pagamento === 'sospeso' ? 'Quota sospesa' : 'Da incassare'}</span>
              <strong>{row.residuo > 0 ? `${euro(row.residuo)} ancora da incassare` : `${euro(row.pagato)} registrati`}</strong>
            </div>

            <div className="payments-student-info-grid">
              <div>
                <span>Pacchetto</span>
                <strong>{row.tipo_pacchetto}</strong>
                <small>{row.corsi.length} corsi inclusi</small>
                <div className="payments-course-chips">
                  {row.corsi.map((course) => <em key={course.id || course.nome}>{course.nome || 'Corso'}</em>)}
                </div>
              </div>
              <div>
                <span>Formula</span>
                <strong>{row.formula}</strong>
                <small>totale mensile del pacchetto</small>
              </div>
              <div>
                <span>Copertura</span>
                <strong>{formatDate(row.copertura_dal)}</strong>
                <small>fino al {formatDate(row.copertura_al)}</small>
              </div>
              <div>
                <span>Quota pacchetto</span>
                <strong>{euro(row.quota_mese)}</strong>
                <small>importo da considerare per {monthLabel(month)}</small>
              </div>
              <div>
                <span>Totale pagamento</span>
                <strong>{euro(row.pagato || row.quota_mese)}</strong>
                <small>{row.corsi.length > 1 ? `${row.corsi.length} righe corso accorpate` : 'quota corso singolo'}</small>
              </div>
            </div>

            <div className="payments-student-actions">
              <button type="button" className="payments-primary-btn" disabled={setPaymentMutation.isPending} onClick={() => markPaid(row)}>
                <CreditCard size={17} /> Segna pagato
              </button>
              <button type="button" className="payments-secondary-btn" disabled={setPaymentMutation.isPending} onClick={() => markDue(row)}>
                Da pagare
              </button>
              <button type="button" className="payments-secondary-btn payments-secondary-btn--muted" disabled={setPaymentMutation.isPending} onClick={() => markPaused(row)}>
                Sospendi/chiudi
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
