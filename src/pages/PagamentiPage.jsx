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
  PackageCheck,
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
import { euro, fetchAllieviPaymentsMonth, setAllievoMonthlyPayment, setAllievoPackagePayment } from '../api/orchideaPayments'
import { fetchPackagesCatalog } from '../api/packagesCatalog'
import { packagesForCourseSelection, resolveCoursePricing } from '../lib/coursePriceList'

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
  if (status === 'gettone') return 'A gettone'
  if (status === 'sospeso') return 'Sospeso/chiuso'
  return 'Da pagare'
}

function statusClass(status) {
  if (status === 'pagato') return 'payments-student-status payments-student-status--paid'
  if (status === 'parziale') return 'payments-student-status payments-student-status--partial'
  if (status === 'gettone') return 'payments-student-status payments-student-status--token'
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
  if (row.stato_pagamento === 'gettone') {
    const count = Number(row.token_payments_count || 0)
    const label = count === 1 ? '1 lezione pagata' : `${count} lezioni pagate`
    return `${label} · ${euro(row.token_paid || row.pagato)} incassati · nessuna copertura mensile`
  }
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
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [coverageStartMonth, setCoverageStartMonth] = useState(currentMonth)
  const [feedback, setFeedback] = useState('')

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-payments'],
    queryFn: fetchOrchideaCourses,
  })

  const paymentsQuery = useQuery({
    queryKey: ['orchidea-allievi-payments', { month, search, courseId, status }],
    queryFn: () => fetchAllieviPaymentsMonth({ month, search, courseId, status }),
  })

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-catalog', { activeOnly: true }],
    queryFn: () => fetchPackagesCatalog({ includeInactive: false }),
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

  const packagePaymentMutation = useMutation({
    mutationFn: setAllievoPackagePayment,
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
  const packages = packagesQuery.data || []
  const paymentPackages = paymentEditor ? packagesForCourseSelection(paymentEditor.corsi || [], packages) : packages
  const selectedPackage = selectedPackageId === '__reduced__'
    ? { id: null, special: true, nome: 'Quota ridotta del mese', tipo: 'ridotta', durata_mesi: 1, prezzo: Number(paymentEditor?.residuo || paymentEditor?.quota_mese || 0) }
    : (paymentPackages.find((item) => String(item.id) === String(selectedPackageId)) || null)
  const packageDuration = Math.max(1, Number(selectedPackage?.durata_mesi || 1))
  const isTokenPackage = selectedPackage?.tipo === 'gettone'
  const isCoveragePackage = Boolean(selectedPackage && !isTokenPackage)
  const coverageEndMonth = dayjs(`${coverageStartMonth || month}-01`).add(packageDuration - 1, 'month').format('YYYY-MM')

  const summary = useMemo(() => rows.reduce((acc, row) => {
    acc.count += 1
    acc.paid += Number(row.pagato || 0)
    if (row.stato_pagamento !== 'gettone') {
      acc.totalDue += Number(row.quota_mese || 0)
      acc.residue += Number(row.residuo || 0)
    }
    if (row.stato_pagamento === 'pagato') acc.paidCount += 1
    if (row.stato_pagamento === 'parziale') acc.partialCount += 1
    if (row.stato_pagamento === 'gettone') acc.tokenCount += 1
    if (row.stato_pagamento === 'sospeso') acc.pausedCount += 1
    if (row.stato_pagamento === 'da_pagare' || row.stato_pagamento === 'parziale') acc.dueCount += 1
    return acc
  }, { count: 0, totalDue: 0, paid: 0, residue: 0, paidCount: 0, partialCount: 0, tokenCount: 0, dueCount: 0, pausedCount: 0 }), [rows])

  const activeFilters = Number(courseId !== 'all') + Number(status !== 'all') + Number(Boolean(search.trim()))
  const editorAmount = parseAmount(paymentAmount)
  const editorPaidAfter = paymentEditor ? Math.min(Number(paymentEditor.pagato || 0) + editorAmount, Number(paymentEditor.quota_mese || 0)) : 0
  const editorResidueAfter = paymentEditor ? Math.max(Number(paymentEditor.quota_mese || 0) - editorPaidAfter, 0) : 0
  const editorError = paymentEditor && (editorAmount <= 0 || (!selectedPackage && editorAmount > Number(paymentEditor.residuo || 0) + 0.001))
  const anyPaymentPending = setPaymentMutation.isPending || packagePaymentMutation.isPending

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
    setCoverageStartMonth(month)
    const rowPackages = packagesForCourseSelection(row.corsi || [], packages)
    const tokenPackage = rowPackages.find((item) => item.tipo === 'gettone' && item.attivo !== false)
    const recommendedMonthly = resolveCoursePricing(row.corsi || [], packages, 'mensile')
    const defaultPackage = row.stato_pagamento === 'gettone'
      ? tokenPackage
      : row.stato_pagamento === 'da_pagare' && Number(row.pagato || 0) <= 0
        ? recommendedMonthly
        : null
    setSelectedPackageId(defaultPackage?.id || '')
    setPaymentAmount(Number(defaultPackage?.prezzo ?? row.residuo ?? row.quota_mese ?? 0).toFixed(2))
    setPaymentMethod(row.metodo_pagamento || method)
    setPaymentNote('')
  }

  function selectPaymentPackage(packageId) {
    setSelectedPackageId(packageId)
    if (packageId === '__reduced__') {
      setCoverageStartMonth(month)
      setPaymentAmount(Number(paymentEditor?.residuo || paymentEditor?.quota_mese || 0).toFixed(2))
      return
    }
    const item = paymentPackages.find((pkg) => String(pkg.id) === String(packageId))
    if (!item) {
      setCoverageStartMonth(month)
      setPaymentAmount(Number(paymentEditor?.residuo || paymentEditor?.quota_mese || 0).toFixed(2))
      return
    }
    const duration = Math.max(1, Number(item.durata_mesi || 1))
    const septemberMultiMonth = String(month).endsWith('-09') && duration > 1
    setCoverageStartMonth(septemberMultiMonth ? dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM') : month)
    setPaymentAmount(Number(item.prezzo || 0).toFixed(2))
  }

  function submitPayment(event) {
    event.preventDefault()
    if (!paymentEditor || editorError) return
    setFeedback('')

    if (selectedPackage) {
      packagePaymentMutation.mutate({
        tesseramentoId: paymentEditor.tesseramento_id,
        startMonth: isTokenPackage ? month : coverageStartMonth,
        packageItem: selectedPackage,
        amount: editorAmount,
        method: paymentMethod,
        note: paymentNote.trim() || `${selectedPackage.nome} registrato da Nova`,
      }, {
        onSuccess: (result) => {
          if (result.kind === 'gettone') {
            setFeedback(`${selectedPackage.nome} di ${euro(editorAmount)} registrato per ${paymentEditor.nomeCompleto}. Il mese non viene segnato come pagato.`)
            return
          }
          const range = result.months.length > 1 ? `${monthLabel(result.months[0])} – ${monthLabel(result.months[result.months.length - 1])}` : monthLabel(result.months[0])
          const septemberNote = String(month).endsWith('-09') && coverageStartMonth !== month ? ' Settembre resta separato e può essere registrato con una quota ridotta.' : ''
          setFeedback(`${selectedPackage.nome} registrato per ${paymentEditor.nomeCompleto}: ${euro(editorAmount)}, copertura ${range}.${septemberNote}`)
        },
      })
      return
    }

    const cumulativeAmount = Math.round((Number(paymentEditor.pagato || 0) + editorAmount) * 100) / 100
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
          <h1>Quote corsisti di {monthLabel(month)}</h1>
          <p>Ogni corsista ha un solo saldo mensile autorevole. Aggiunte di corsi, riaperture e pagamenti parziali vengono ricalcolati senza sommare vecchi duplicati.</p>
        </div>
        <span className="payments-students-hero-pill"><WalletCards size={17} /> Saldi controllati</span>
      </div>

      <div className="payments-summary-grid payments-student-summary-grid">
        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--students">
          <div className="payments-summary-icon"><UserRoundCheck size={22} /></div>
          <div className="payments-summary-content">
            <span className="payments-summary-label">Corsisti</span>
            <strong className="payments-summary-value">{summary.count}</strong>
            <div className="payments-summary-footer">
              <small>Nel mese selezionato</small>
            </div>
          </div>
        </div>

        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--due">
          <div className="payments-summary-icon"><Euro size={22} /></div>
          <div className="payments-summary-content">
            <span className="payments-summary-label">Da incassare</span>
            <strong className="payments-summary-value payments-summary-amount">{euro(summary.residue)}</strong>
            <div className="payments-summary-footer">
              <small>{summary.dueCount} {summary.dueCount === 1 ? 'saldo aperto' : 'saldi aperti'}</small>
            </div>
          </div>
        </div>

        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--paid">
          <div className="payments-summary-icon"><CheckCircle2 size={22} /></div>
          <div className="payments-summary-content">
            <span className="payments-summary-label">Incassato</span>
            <strong className="payments-summary-value payments-summary-amount">{euro(summary.paid)}</strong>
            <div className="payments-summary-footer">
              <small>{summary.paidCount} coperti <span aria-hidden="true">•</span> {summary.partialCount} parziali <span aria-hidden="true">•</span> {summary.tokenCount} a gettone</small>
            </div>
          </div>
        </div>

        <div className="payments-summary-card payments-student-summary-card payments-student-summary-card--paused">
          <div className="payments-summary-icon"><XCircle size={22} /></div>
          <div className="payments-summary-content">
            <span className="payments-summary-label">Sospesi/chiusi</span>
            <strong className="payments-summary-value">{summary.pausedCount}</strong>
            <div className="payments-summary-footer">
              <small>Fuori dal residuo operativo</small>
            </div>
          </div>
        </div>
      </div>

      <div className="payments-filter-panel">
        <div className="payments-filter-panel__head">
          <div>
            <span className="payments-filter-icon"><SlidersHorizontal size={18} /></span>
            <div><strong>Ricerca e filtri</strong><small>Trova rapidamente un corsista e lavora sul mese corretto.</small></div>
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
            <span>Cerca corsista</span>
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
                ['gettone', 'A gettone'],
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
      {(setPaymentMutation.error || packagePaymentMutation.error) ? <div className="form-error">Errore salvataggio: {(setPaymentMutation.error || packagePaymentMutation.error).message}</div> : null}
      {paymentsQuery.isLoading ? <div className="payments-empty-state">Caricamento quote corsisti…</div> : null}
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
              {row.stato_pagamento === 'gettone' ? (
                <>
                  <div><span>Costo gettone</span><strong>{euro(row.nova_package_total || (row.token_payments_count ? row.token_paid / row.token_payments_count : 0))}</strong></div>
                  <div><span>Gettoni mese</span><strong>{row.token_payments_count || 0}</strong></div>
                  <div className="is-ok"><span>Incassato</span><strong>{euro(row.token_paid || row.pagato)}</strong></div>
                </>
              ) : (
                <>
                  <div><span>Quota</span><strong>{euro(row.quota_mese)}</strong></div>
                  <div><span>Incassato</span><strong>{euro(row.pagato)}</strong></div>
                  <div className={row.residuo > 0 ? 'is-due' : 'is-ok'}><span>Residuo</span><strong>{euro(row.residuo)}</strong></div>
                </>
              )}
            </div>

            <div className="payments-compact-statusline">{paymentHeadline(row)}</div>

            <div className="payments-student-actions payments-student-actions--compact">
              {row.stato_pagamento === 'pagato' ? (
                <button type="button" className="payments-paid-btn" disabled><CheckCircle2 size={17} /> Pagamento registrato</button>
              ) : row.stato_pagamento === 'sospeso' ? null : (
                <button type="button" className="payments-primary-btn" disabled={anyPaymentPending || (row.stato_pagamento !== 'gettone' && row.residuo <= 0)} onClick={() => openPaymentEditor(row)}>
                  <CreditCard size={17} /> {row.stato_pagamento === 'gettone' ? 'Registra altro gettone' : row.stato_pagamento === 'parziale' ? 'Incassa residuo' : 'Registra pagamento'}
                </button>
              )}

              {(row.stato_pagamento === 'pagato' || row.stato_pagamento === 'parziale' || row.stato_pagamento === 'sospeso') ? (
                <button type="button" className="payments-secondary-btn" disabled={anyPaymentPending} onClick={() => markDue(row)}>
                  <RotateCcw size={16} /> Riapri pagamento
                </button>
              ) : row.stato_pagamento === 'gettone' ? null : (
                <button type="button" className="payments-secondary-btn payments-secondary-btn--muted" disabled={anyPaymentPending} onClick={() => markPaused(row)}>
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
              <div><span className="payments-modal-eyebrow">Registra incasso</span><h2>{paymentEditor.nomeCompleto}</h2><p>{monthLabel(month)}{paymentEditor.stato_pagamento === 'gettone' ? ' · pagamento a lezione singola' : ` · residuo attuale ${euro(paymentEditor.residuo)}`}</p></div>
              <button type="button" className="payments-close-btn" onClick={() => setPaymentEditor(null)}><X size={18} /></button>
            </div>

            <div className="payments-register-summary">
              {paymentEditor.stato_pagamento === 'gettone' ? (
                <>
                  <div><span>Gettoni già registrati</span><strong>{paymentEditor.token_payments_count || 0}</strong></div>
                  <div><span>Incassato a gettone</span><strong>{euro(paymentEditor.token_paid || paymentEditor.pagato)}</strong></div>
                  <div><span>Copertura mese</span><strong>Nessuna</strong></div>
                </>
              ) : (
                <>
                  <div><span>Quota mese</span><strong>{euro(paymentEditor.quota_mese)}</strong></div>
                  <div><span>Già incassato</span><strong>{euro(paymentEditor.pagato)}</strong></div>
                  <div><span>Residuo</span><strong>{euro(paymentEditor.residuo)}</strong></div>
                </>
              )}
            </div>

            <div className="payments-package-choice">
              <label className="payments-form-field payments-form-field-full">
                <span>Pacchetto / formula di pagamento</span>
                <select value={selectedPackageId} onChange={(event) => selectPaymentPackage(event.target.value)}>
                  <option value="">Pagamento mensile / acconto</option>
                  <option value="__reduced__">Quota ridotta del mese · saldo completo</option>
                  {paymentPackages.map((item) => <option value={item.id} key={item.id}>{item.nome} · {euro(item.prezzo)} · {item.tipo === 'gettone' ? 'lezione singola' : `${item.durata_mesi} ${item.durata_mesi === 1 ? 'mese' : 'mesi'}`}</option>)}
                </select>
                {packagesQuery.error ? <small className="payments-inline-error">{packagesQuery.error.message}</small> : null}
                {paymentEditor?.pricing_group_label ? <small>Listino automatico: <strong>{paymentEditor.pricing_group_label}</strong>. Puoi scegliere gettone, mensile, trimestrale o annuale.</small> : null}
              </label>
              {selectedPackage ? <div className="payments-package-selected"><PackageCheck size={18} /><div><strong>{selectedPackage.nome}</strong><span>{isTokenPackage ? `Lezione singola · nessuna copertura mensile · prezzo ${euro(selectedPackage.prezzo)}` : `${selectedPackage.durata_mesi} ${selectedPackage.durata_mesi === 1 ? 'mese' : 'mesi'} di copertura · prezzo proposto ${euro(selectedPackage.prezzo)}`}</span></div></div> : null}
            </div>

            <div className="payments-form-grid">
              <label className="payments-form-field">
                <span>{selectedPackage ? (isTokenPackage ? 'Importo gettone incassato' : 'Prezzo pacchetto incassato') : 'Importo incassato adesso'}</span>
                <input type="number" min="0.01" max={selectedPackage ? undefined : paymentEditor.residuo} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} autoFocus />
                <small>Importo sempre modificabile prima del salvataggio.</small>
                {editorError ? <small className="payments-inline-error">{selectedPackage ? 'Inserisci un prezzo maggiore di 0 €.' : `Inserisci un importo tra 0,01 € e ${euro(paymentEditor.residuo)}.`}</small> : null}
              </label>
              <label className="payments-form-field">
                <span>Metodo di incasso</span>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option>Contanti</option><option>Bonifico</option><option>Carta</option><option>POS</option>
                </select>
              </label>
              {selectedPackage && !selectedPackage.special && !isTokenPackage ? <label className="payments-form-field"><span>Inizio copertura</span><input type="month" min={String(month).endsWith('-09') && packageDuration > 1 ? dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM') : undefined} value={coverageStartMonth} onChange={(event) => setCoverageStartMonth(event.target.value)} /><small>Fine copertura: {monthLabel(coverageEndMonth)}</small></label> : null}
              <label className={`payments-form-field ${selectedPackage ? '' : 'payments-form-field-full'}`}>
                <span>Nota facoltativa</span>
                <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Esempio: settembre ridotto / trimestrale ottobre-dicembre" />
              </label>
            </div>

            {selectedPackage && String(month).endsWith('-09') && packageDuration > 1 ? <div className="payments-september-hint"><CalendarDays size={19} /><div><strong>Settembre resta separato</strong><span>Per i pacchetti multi-mese Nova propone automaticamente ottobre come inizio. Registra prima settembre con “Quota ridotta del mese · saldo completo”, poi il trimestre da ottobre.</span></div></div> : null}

            <div className="payments-register-result">
              <span>Dopo il salvataggio</span>
              {isTokenPackage ? <strong>{euro(editorAmount)} incassati · 1 lezione singola · il mese resta non coperto</strong> : isCoveragePackage ? <strong>{euro(editorAmount)} incassati · copertura {monthLabel(coverageStartMonth)} → {monthLabel(coverageEndMonth)}</strong> : <strong>{euro(editorPaidAfter)} incassati · {euro(editorResidueAfter)} residui</strong>}
            </div>

            <div className="payments-form-actions">
              <button type="button" className="payments-secondary-btn" onClick={() => setPaymentEditor(null)}>Annulla</button>
              <button type="submit" className="payments-primary-btn" disabled={Boolean(editorError) || anyPaymentPending}>
                <CreditCard size={17} /> {anyPaymentPending ? 'Salvataggio…' : 'Conferma incasso'}
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
              <span>{selectedRow.stato_pagamento === 'gettone' ? 'Pagamento a lezione singola' : 'Saldo mensile'}</span>
              <strong>{paymentHeadline(selectedRow)}</strong>
            </div>

            <div className="payments-student-info-grid">
              <div><span>Pacchetto</span><strong>{selectedRow.tipo_pacchetto}</strong><small>{selectedRow.corsi.length} corsi collegati</small><div className="payments-course-chips">{selectedRow.corsi.map((course) => <em key={course.id || course.nome}>{course.nome || 'Corso'}</em>)}</div></div>
              <div><span>Formula</span><strong>{selectedRow.formula}</strong><small>{selectedRow.stato_pagamento === 'gettone' ? 'pagamento per singola lezione' : 'totale mensile del pacchetto'}</small></div>
              {selectedRow.stato_pagamento === 'gettone' ? (
                <>
                  <div><span>Copertura</span><strong>Nessuna copertura mensile</strong><small>ogni gettone vale una singola lezione</small></div>
                  <div><span>Costo gettone</span><strong>{euro(selectedRow.nova_package_total || (selectedRow.token_payments_count ? selectedRow.token_paid / selectedRow.token_payments_count : 0))}</strong><small>prezzo per lezione</small></div>
                  <div><span>Gettoni nel mese</span><strong>{selectedRow.token_payments_count || 0}</strong><small>incassato {euro(selectedRow.token_paid || selectedRow.pagato)}</small></div>
                </>
              ) : (
                <>
                  <div><span>Copertura</span><strong>{formatDate(selectedRow.copertura_dal)}</strong><small>fino al {formatDate(selectedRow.copertura_al)}</small></div>
                  <div><span>Quota pacchetto</span><strong>{euro(selectedRow.quota_mese)}</strong><small>competenza {monthLabel(month)}</small></div>
                  <div><span>Saldo registrato</span><strong>{euro(selectedRow.pagato)}</strong><small>{selectedRow.metodo_pagamento || 'Metodo non indicato'}{selectedRow.data_pagamento ? ` · ${formatDate(selectedRow.data_pagamento)}` : ''}</small></div>
                </>
              )}
            </div>

            <div className="payments-ledger-note">
              <strong>Controllo contabile Nova</strong>
              {selectedRow.stato_pagamento === 'gettone' ? (
                <p>I gettoni vengono registrati come lezioni singole autonome: aumentano l’incassato del mese, ma non possono mai segnare l’intera quota mensile come pagata.</p>
              ) : (
                <p>Saldo calcolato da un unico record mensile autorevole. {selectedRow.payment_source === 'legacy' ? 'I vecchi record sono stati normalizzati senza duplicare gli importi.' : 'Eventuali vecchie righe per-corso non vengono sommate due volte.'}</p>
              )}
              {selectedRow.nota_pagamento ? <small>Nota: {selectedRow.nota_pagamento}</small> : null}
              {selectedRow.payment_ignored_excess > 0 ? <small>Eccedenza duplicata ignorata: {euro(selectedRow.payment_ignored_excess)}</small> : null}
            </div>

            <div className="payments-student-actions">
              {selectedRow.stato_pagamento !== 'pagato' && selectedRow.stato_pagamento !== 'sospeso' ? <button type="button" className="payments-primary-btn" onClick={() => { setSelectedRow(null); openPaymentEditor(selectedRow) }}><CreditCard size={17} /> {selectedRow.stato_pagamento === 'gettone' ? 'Registra altro gettone' : 'Registra incasso'}</button> : null}
              {selectedRow.stato_pagamento !== 'da_pagare' && selectedRow.stato_pagamento !== 'gettone' ? <button type="button" className="payments-secondary-btn" onClick={() => markDue(selectedRow)}><RotateCcw size={16} /> Riapri pagamento</button> : null}
              <button type="button" className="payments-secondary-btn" onClick={() => setSelectedRow(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
