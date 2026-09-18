import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Euro,
  Gift,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { addCourseParticipant, fetchOrchideaCourseCatalog, fetchOrchideaStudents, removeCourseParticipant } from '../api/orchideaEntities'
import {
  euro,
  fetchStudentPaymentMonth,
  rollbackAllievoPackagePaymentResult,
  setAllievoMonthlyPayment,
  setAllievoPackagePayment,
} from '../api/orchideaPayments'
import { fetchPackagesCatalog } from '../api/packagesCatalog'
import { fetchTesseratoDetails } from '../api/tesserati'
import { COURSE_MEMBERSHIP_FEE, setMembershipFeePaidAmount } from '../api/membershipFees'
import { packagesForCourseSelection, resolveCoursePricing } from '../lib/coursePriceList'
import { enrollmentIsActiveForMonth } from '../lib/packagePricing'
import '../styles/RegistraPagamentoPage.css'

const currentMonth = dayjs().format('YYYY-MM')

function fullName(row = {}) {
  return row.nomeCompleto || `${row.nome || ''} ${row.cognome || ''}`.trim() || 'Senza nome'
}

function initials(row = {}) {
  return fullName(row)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function monthLabel(month) {
  const parsed = dayjs(`${month}-01`)
  return parsed.isValid()
    ? new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(parsed.toDate())
    : month
}

function statusLabel(status) {
  if (status === 'pagato') return 'Pagato'
  if (status === 'parziale') return 'Parziale'
  if (status === 'omaggio') return 'Omaggio'
  if (status === 'gettone') return 'A gettone'
  if (status === 'sospeso') return 'Sospeso'
  return 'Da pagare'
}

function parseAmount(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export default function RegistraPagamentoPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [month, setMonth] = useState(currentMonth)
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [payMembership, setPayMembership] = useState(false)
  const [payCourses, setPayCourses] = useState(null)
  const [partialMode, setPartialMode] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Contanti')
  const [note, setNote] = useState('')
  const [result, setResult] = useState(null)
  const [courseManagerOpen, setCourseManagerOpen] = useState(false)
  const [courseDraftIds, setCourseDraftIds] = useState([])

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
    staleTime: 3 * 60_000,
    gcTime: 15 * 60_000,
  })

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-catalog', { activeOnly: true }],
    queryFn: () => fetchPackagesCatalog({ includeInactive: false }),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  })

  const paymentQuery = useQuery({
    queryKey: ['guided-payment-student', selectedStudent?.id, month],
    queryFn: () => fetchStudentPaymentMonth({
      tesseramentoId: selectedStudent.id,
      month,
      student: selectedStudent,
    }),
    enabled: Boolean(selectedStudent?.id),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  })

  // Gestione corsi caricata solo quando la segretaria apre il pulsante dedicato:
  // nessun costo aggiuntivo nel flusso normale di pagamento.
  const courseCatalogQuery = useQuery({
    queryKey: ['orchidea-course-catalog'],
    queryFn: fetchOrchideaCourseCatalog,
    enabled: courseManagerOpen,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  })

  const courseDetailsQuery = useQuery({
    queryKey: ['tesserato-details', selectedStudent?.id],
    queryFn: () => fetchTesseratoDetails(selectedStudent.id),
    enabled: Boolean(courseManagerOpen && selectedStudent?.id),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const students = useMemo(
    () => (studentsQuery.data || []).filter((student) => student.is_corsista === true),
    [studentsQuery.data],
  )

  const matches = useMemo(() => {
    const term = normalizeSearch(search)
    if (term.length < 2) return []
    return students
      .filter((student) => [
        fullName(student),
        student.email,
        student.telefono,
        student.cf,
        student.numero_tessera,
      ].some((value) => normalizeSearch(value).includes(term)))
      .slice(0, 8)
  }, [students, search])

  const payment = paymentQuery.data || null
  const packages = useMemo(() => packagesQuery.data || [], [packagesQuery.data])
  const paymentPackages = useMemo(
    () => packagesForCourseSelection(payment?.corsi || [], packages),
    [payment?.corsi, packages],
  )
  const recommendedMonthly = useMemo(
    () => resolveCoursePricing(payment?.corsi || [], packages, 'mensile'),
    [payment?.corsi, packages],
  )


  const availableCourses = useMemo(
    () => (courseCatalogQuery.data || []).filter((course) => course.attivo !== false),
    [courseCatalogQuery.data],
  )

  const activeEnrollmentsForMonth = useMemo(
    () => (courseDetailsQuery.data?.enrollments || []).filter((row) => enrollmentIsActiveForMonth(row, month)),
    [courseDetailsQuery.data, month],
  )

  const activeEnrollmentByCourse = useMemo(() => {
    const map = new Map()
    activeEnrollmentsForMonth.forEach((row) => {
      const courseId = String(row.corso_id || row.corsi?.id || '')
      if (courseId && !map.has(courseId)) map.set(courseId, row)
    })
    return map
  }, [activeEnrollmentsForMonth])

  const residueOption = payment && Number(payment.pagato || 0) > 0 && Number(payment.residuo || 0) > 0
    ? {
        id: '__residue__',
        special: true,
        nome: `Saldo residuo · ${monthLabel(month)}`,
        tipo: 'residuo',
        durata_mesi: 1,
        prezzo: Number(payment.residuo || 0),
        descrizione: 'Incassa solo ciò che manca per chiudere il mese.',
      }
    : null

  const defaultPackageId = residueOption
    ? '__residue__'
    : String(recommendedMonthly?.id || paymentPackages.find((item) => item.tipo === 'mensile')?.id || '')
  const effectivePackageId = selectedPackageId || defaultPackageId
  const selectedPackage = effectivePackageId === '__residue__'
    ? residueOption
    : paymentPackages.find((item) => String(item.id) === String(effectivePackageId)) || recommendedMonthly || null

  const isGift = selectedPackage?.tipo === 'omaggio'
  const isToken = selectedPackage?.tipo === 'gettone'
  const isMultiMonth = Number(selectedPackage?.durata_mesi || 1) > 1
  const membershipRemaining = Number(payment?.membership_fee_remaining || 0)
  const mustPayMembership = Boolean(isGift && membershipRemaining > 0)
  const effectivePayMembership = payMembership || mustPayMembership
  const defaultPayCourses = Boolean(
    payment
    && Number(payment.residuo || 0) > 0
    && !['pagato', 'omaggio', 'sospeso'].includes(payment.stato_pagamento),
  )
  const effectivePayCourses = payCourses === null ? defaultPayCourses : payCourses
  const maxCourseAmount = selectedPackage?.tipo === 'residuo'
    ? Number(payment?.residuo || 0)
    : Number(selectedPackage?.prezzo || 0)
  const defaultAmount = isGift ? 0 : maxCourseAmount
  const effectiveAmount = amount === '' ? Number(defaultAmount || 0).toFixed(2) : amount
  const courseAmount = isGift ? 0 : parseAmount(effectiveAmount)
  const membershipCash = effectivePayMembership ? membershipRemaining : 0
  const totalCash = membershipCash + (effectivePayCourses ? courseAmount : 0)
  const canPartial = Boolean(
    effectivePayCourses
    && !isGift
    && !isToken
    && !isMultiMonth
    && selectedPackage
    && Number(payment?.residuo || 0) > 0,
  )
  const amountInvalid = Boolean(
    effectivePayCourses
    && !isGift
    && (courseAmount <= 0 || (canPartial && courseAmount > Number(payment?.residuo || maxCourseAmount || 0) + 0.001)),
  )

  function choosePackage(packageId) {
    const item = packageId === '__residue__'
      ? residueOption
      : paymentPackages.find((pkg) => String(pkg.id) === String(packageId))
    setSelectedPackageId(String(packageId))
    setPayCourses(true)
    setPartialMode(false)
    setAmount(item?.tipo === 'omaggio' ? '0.00' : Number(item?.prezzo || 0).toFixed(2))
  }

  const courseManagerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStudent?.id) throw new Error('Seleziona un corsista.')
      if (!courseDetailsQuery.data) throw new Error('Attendi il caricamento dei corsi attuali.')

      const desired = new Set(courseDraftIds.map(String))
      const current = new Set(activeEnrollmentByCourse.keys())
      const toAdd = [...desired].filter((courseId) => !current.has(courseId))
      const toRemove = [...current].filter((courseId) => !desired.has(courseId))

      if (!toAdd.length && !toRemove.length) return { changed: false }

      const added = []
      const removedCourseIds = []

      try {
        for (const courseId of toAdd) {
          const enrollment = await addCourseParticipant({
            courseId,
            studentId: selectedStudent.id,
            tariffaMensile: null,
            effectiveMonth: month,
          })
          if (enrollment?.id && enrollment?._nova_reused !== true) added.push(enrollment.id)
        }

        for (const courseId of toRemove) {
          const enrollment = activeEnrollmentByCourse.get(courseId)
          if (!enrollment?.id) continue
          await removeCourseParticipant(enrollment.id, { effectiveMonth: month })
          removedCourseIds.push(courseId)
        }

        return { changed: true, added: toAdd.length, removed: toRemove.length }
      } catch (error) {
        // Ripristino best-effort: se una delle modifiche fallisce, riportiamo il
        // corsista alla situazione precedente per evitare configurazioni parziali.
        for (const courseId of removedCourseIds.reverse()) {
          try {
            await addCourseParticipant({
              courseId,
              studentId: selectedStudent.id,
              tariffaMensile: null,
              effectiveMonth: month,
            })
          } catch {
            // Il messaggio finale invita comunque al controllo se il rollback non riesce.
          }
        }
        for (const enrollmentId of added.reverse()) {
          try {
            await removeCourseParticipant(enrollmentId)
          } catch {
            // best effort
          }
        }
        throw new Error(error?.message || 'Non sono riuscito ad aggiornare i corsi. Nessun pagamento è stato registrato.')
      }
    },
    onSuccess: async () => {
      setSelectedPackageId('')
      setPayCourses(null)
      setPartialMode(false)
      setAmount('')
      setNote('')

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tesserato-details', selectedStudent?.id] }),
        queryClient.invalidateQueries({ queryKey: ['guided-payment-student', selectedStudent?.id, month] }),
        queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] }),
      ])
      await queryClient.refetchQueries({ queryKey: ['guided-payment-student', selectedStudent?.id, month], type: 'active' })
      setCourseManagerOpen(false)
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStudent?.id) throw new Error('Seleziona un corsista.')
      if (!effectivePayCourses && !effectivePayMembership) throw new Error('Seleziona almeno una voce da incassare.')
      if (effectivePayCourses && !selectedPackage) throw new Error('Seleziona il tipo di pagamento.')
      if (amountInvalid) throw new Error('Controlla l’importo inserito.')

      let courseResult = null
      let courseMode = null
      let membershipSaved = false
      const previousPaid = Number(payment?.pagato || 0)

      try {
        if (effectivePayCourses) {
          const shouldUseMonthlyLedger = Boolean(
            selectedPackage?.tipo === 'residuo'
            || partialMode
            || (!isGift && !isToken && !isMultiMonth && previousPaid > 0),
          )

          if (shouldUseMonthlyLedger) {
            const increment = courseAmount
            const cumulative = Math.min(
              Math.round((previousPaid + increment) * 100) / 100,
              Number(payment?.quota_mese || previousPaid + increment),
            )
            courseResult = await setAllievoMonthlyPayment({
              tesseramentoId: selectedStudent.id,
              month,
              amount: cumulative,
              status: 'pagato',
              method,
              note: note.trim() || `Incasso di ${euro(increment)} registrato da Pagamento guidato Nova`,
            })
            courseMode = 'monthly'
          } else {
            courseResult = await setAllievoPackagePayment({
              tesseramentoId: selectedStudent.id,
              startMonth: month,
              packageItem: selectedPackage,
              amount: isGift ? 0 : courseAmount,
              method: isGift ? 'Omaggio' : method,
              note: note.trim() || `${selectedPackage.nome} registrato da Pagamento guidato Nova`,
            })
            courseMode = 'package'
          }
        }

        if (effectivePayMembership && membershipRemaining > 0) {
          await setMembershipFeePaidAmount({
            studentId: selectedStudent.id,
            paidAmount: COURSE_MEMBERSHIP_FEE,
            source: 'pagamento_guidato_nova',
            chargedMonth: month,
          })
          membershipSaved = true
        }

        return {
          student: selectedStudent,
          month,
          packageItem: effectivePayCourses ? selectedPackage : null,
          courseCash: effectivePayCourses ? courseAmount : 0,
          membershipCash: membershipSaved ? membershipRemaining : 0,
          totalCash,
          method: totalCash > 0 ? method : 'Omaggio',
          courseMode,
        }
      } catch (error) {
        if (courseResult && effectivePayMembership && !membershipSaved) {
          try {
            if (courseMode === 'package') {
              await rollbackAllievoPackagePaymentResult(courseResult)
            } else if (courseMode === 'monthly') {
              await setAllievoMonthlyPayment({
                tesseramentoId: selectedStudent.id,
                month,
                amount: previousPaid,
                status: previousPaid > 0 ? 'pagato' : 'da_pagare',
                method: payment?.metodo_pagamento || method,
                note: 'Ripristino automatico dopo errore del pagamento guidato',
              })
            }
          } catch (rollbackError) {
            const safe = new Error('Il pagamento non è stato completato e Nova non ha potuto verificare il ripristino. Non ripetere l’incasso: controlla Pagamenti prima di procedere.')
            safe.cause = rollbackError
            throw safe
          }
        }
        throw error
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      queryClient.invalidateQueries({ queryKey: ['guided-payment-student'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
      queryClient.invalidateQueries({ queryKey: ['membership-fee-records'] })
      queryClient.invalidateQueries({ queryKey: ['membership-fee-record'] })
      setResult(saved)
    },
  })

  function openCourseManager() {
    const currentIds = (payment?.corsi || []).map((course) => String(course.id)).filter(Boolean)
    setCourseDraftIds(currentIds)
    courseManagerMutation.reset()
    setCourseManagerOpen(true)
  }

  function closeCourseManager() {
    if (courseManagerMutation.isPending) return
    setCourseManagerOpen(false)
    setCourseDraftIds([])
    courseManagerMutation.reset()
  }

  function toggleManagedCourse(courseId) {
    const id = String(courseId)
    setCourseDraftIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function selectStudent(student) {
    setSelectedStudent(student)
    setSearch(fullName(student))
    setMonth(currentMonth)
    setSelectedPackageId('')
    setPayMembership(false)
    setPayCourses(null)
    setPartialMode(false)
    setAmount('')
    setMethod('Contanti')
    setNote('')
    setResult(null)
    setCourseManagerOpen(false)
    setCourseDraftIds([])
    saveMutation.reset()
  }

  function clearStudent() {
    setSelectedStudent(null)
    setSearch('')
    setSelectedPackageId('')
    setPayMembership(false)
    setPayCourses(null)
    setPartialMode(false)
    setAmount('')
    setNote('')
    setResult(null)
    setCourseManagerOpen(false)
    setCourseDraftIds([])
    saveMutation.reset()
  }

  function resetAll() {
    clearStudent()
    setMonth(currentMonth)
  }

  function setPaymentMonth(nextMonth) {
    setMonth(nextMonth || currentMonth)
    setSelectedPackageId('')
    setPayCourses(null)
    setPartialMode(false)
    setAmount('')
    setNote('')
    setCourseManagerOpen(false)
    setCourseDraftIds([])
    saveMutation.reset()
  }

  function changeMonth(delta) {
    setPaymentMonth(dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM'))
  }

  if (result) {
    return (
      <section className="guided-payment-page">
        <div className="guided-payment-success">
          <button type="button" className="guided-payment-success-close" onClick={resetAll}><X size={18} /> Chiudi</button>
          <span className="guided-payment-success-icon"><CheckCircle2 size={35} /></span>
          <div className="guided-payment-eyebrow guided-payment-eyebrow--success">Pagamento registrato</div>
          <h1>{fullName(result.student)}</h1>
          <p>Nova ha salvato il pagamento e aggiornato automaticamente i saldi collegati.</p>

          <div className="guided-payment-success-grid">
            <div><span>Periodo</span><strong>{monthLabel(result.month)}</strong></div>
            <div><span>Pagamento corsi</span><strong>{result.packageItem?.nome || 'Nessuno'}</strong><small>{euro(result.courseCash)}</small></div>
            <div><span>Tessera corsista</span><strong>{result.membershipCash > 0 ? 'Incassata' : 'Non incassata ora'}</strong><small>{result.membershipCash > 0 ? euro(result.membershipCash) : '—'}</small></div>
            <div><span>Totale incassato</span><strong>{euro(result.totalCash)}</strong><small>{result.method}</small></div>
          </div>

          <div className="guided-payment-success-actions">
            <button type="button" className="guided-payment-secondary" onClick={() => navigate('/pagamenti')}>Vai a Pagamenti</button>
            <button type="button" className="guided-payment-primary" onClick={resetAll}>Nuovo pagamento</button>
          </div>
        </div>
      </section>
    )
  }

  const personReady = Boolean(selectedStudent)
  const periodReady = Boolean(personReady && payment && !paymentQuery.isFetching)
  const choiceReady = Boolean(periodReady && (effectivePayCourses || effectivePayMembership) && (!effectivePayCourses || selectedPackage) && !amountInvalid)
  const noActiveCourses = Boolean(periodReady && (!payment?.corsi || payment.corsi.length === 0))
  const courseAlreadyCovered = Boolean(periodReady && ['pagato', 'omaggio', 'sospeso'].includes(payment?.stato_pagamento))

  return (
    <section className="guided-payment-page">
      <div className="guided-payment-hero">
        <div>
          <span className="guided-payment-eyebrow"><WalletCards size={15} /> Flusso rapido segreteria</span>
          <h1>Registra pagamento</h1>
          <p>Cerca il corsista, scegli il mese, indica cosa sta pagando e conferma. Tutto senza passare dalla lista completa.</p>
        </div>
        <div className="guided-payment-hero-badge"><CircleDollarSign size={22} /><span><strong>4 passaggi</strong><small>pensato per tablet</small></span></div>
      </div>

      <div className="guided-payment-steps">
        <span className={personReady ? 'is-done' : 'is-active'}><b>{personReady ? <Check size={15} /> : '1'}</b> Persona</span>
        <i />
        <span className={periodReady ? 'is-done' : personReady ? 'is-active' : ''}><b>{periodReady ? <Check size={15} /> : '2'}</b> Mese</span>
        <i />
        <span className={choiceReady ? 'is-done' : periodReady ? 'is-active' : ''}><b>{choiceReady ? <Check size={15} /> : '3'}</b> Pagamento</span>
        <i />
        <span className={choiceReady ? 'is-active' : ''}><b>4</b> Conferma</span>
      </div>

      <div className="guided-payment-layout">
        <div className="guided-payment-main">
          <article className="guided-payment-card">
            <div className="guided-payment-card-head">
              <span className="guided-payment-card-icon"><UserRound size={20} /></span>
              <div><small>Passaggio 1</small><h2>Chi sta pagando?</h2><p>Cerca per nome, telefono, codice fiscale o tessera.</p></div>
            </div>

            {!selectedStudent ? (
              <>
                <label className="guided-payment-search">
                  <Search size={20} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, telefono, codice fiscale o tessera…" autoComplete="off" />
                </label>
                {studentsQuery.isLoading ? <div className="guided-payment-loading">Carico l’anagrafica…</div> : null}
                {search.trim().length >= 2 && !studentsQuery.isLoading ? (
                  <div className="guided-payment-results">
                    {matches.length ? matches.map((student) => (
                      <button type="button" key={student.id} onClick={() => selectStudent(student)}>
                        <span className="guided-payment-avatar">{initials(student)}</span>
                        <span><strong>{fullName(student)}</strong><small>{student.numero_tessera || student.cf || student.telefono || 'Corsista'}</small></span>
                        <Check size={18} />
                      </button>
                    )) : <div className="guided-payment-empty">Nessun corsista trovato.</div>}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="guided-payment-selected-person">
                <span className="guided-payment-avatar guided-payment-avatar--large">{initials(selectedStudent)}</span>
                <div><strong>{fullName(selectedStudent)}</strong><small>{selectedStudent.numero_tessera || selectedStudent.cf}</small></div>
                <button type="button" onClick={clearStudent}>Cambia</button>
              </div>
            )}
          </article>

          {personReady ? (
            <article className="guided-payment-card">
              <div className="guided-payment-card-head">
                <span className="guided-payment-card-icon"><CalendarDays size={20} /></span>
                <div><small>Passaggio 2</small><h2>Quale mese stai registrando?</h2><p>Nova controlla subito quota, corsi e pagamenti già presenti.</p></div>
              </div>

              <div className="guided-payment-month-picker">
                <button type="button" onClick={() => changeMonth(-1)} aria-label="Mese precedente"><ChevronLeft size={20} /></button>
                <input type="month" value={month} onChange={(event) => setPaymentMonth(event.target.value || currentMonth)} />
                <button type="button" onClick={() => changeMonth(1)} aria-label="Mese successivo"><ChevronRight size={20} /></button>
              </div>

              {paymentQuery.isFetching ? <div className="guided-payment-loading">Controllo il saldo di {monthLabel(month)}…</div> : null}
              {paymentQuery.isError ? <div className="guided-payment-error">{paymentQuery.error?.message || 'Errore caricamento saldo.'}</div> : null}

              {periodReady ? (
                <div className="guided-payment-period-summary">
                  <div><span>Stato</span><strong className={`is-status-${payment.stato_pagamento}`}>{statusLabel(payment.stato_pagamento)}</strong></div>
                  <div><span>Quota corsi</span><strong>{euro(payment.quota_mese)}</strong></div>
                  <div><span>Già registrato</span><strong>{euro(payment.pagato)}</strong></div>
                  <div><span>Residuo</span><strong>{euro(payment.residuo)}</strong></div>
                </div>
              ) : null}

              {periodReady ? (
                <div className="guided-payment-course-tools">
                  <div>
                    {payment.corsi?.length ? (
                      <div className="guided-payment-course-list">
                        {payment.corsi.map((course) => <span key={course.id}>{course.nome}</span>)}
                      </div>
                    ) : <div className="guided-payment-warning">Questo corsista non ha corsi attivi nel mese selezionato.</div>}
                  </div>
                  <button type="button" className="guided-payment-course-manage-button" onClick={openCourseManager}>
                    <BookOpenCheck size={17} /> Aggiungi / elimina corsi
                  </button>
                </div>
              ) : null}
            </article>
          ) : null}

          {periodReady ? (
            <article className="guided-payment-card">
              <div className="guided-payment-card-head">
                <span className="guided-payment-card-icon"><CreditCard size={20} /></span>
                <div><small>Passaggio 3</small><h2>Cosa sta pagando?</h2><p>Spunta solo ciò che stai realmente incassando.</p></div>
              </div>

              <label className={`guided-payment-line ${membershipRemaining <= 0 ? 'is-paid' : ''}`}>
                <input
                  type="checkbox"
                  checked={membershipRemaining <= 0 ? true : effectivePayMembership}
                  disabled={membershipRemaining <= 0 || mustPayMembership}
                  onChange={(event) => setPayMembership(event.target.checked)}
                />
                <span className="guided-payment-line-icon"><ShieldCheck size={19} /></span>
                <span><strong>Tessera corsista</strong><small>{membershipRemaining <= 0 ? 'Già pagata' : mustPayMembership ? 'Obbligatoria con l’omaggio' : `Da incassare ${euro(membershipRemaining)}`}</small></span>
                <b>{membershipRemaining <= 0 ? 'Pagata' : euro(membershipRemaining)}</b>
              </label>

              {!noActiveCourses ? (
                <label className={`guided-payment-line ${courseAlreadyCovered ? 'is-paid' : ''}`}>
                  <input
                    type="checkbox"
                    checked={effectivePayCourses}
                    disabled={courseAlreadyCovered && payment.stato_pagamento !== 'gettone'}
                    onChange={(event) => setPayCourses(event.target.checked)}
                  />
                  <span className="guided-payment-line-icon"><Euro size={19} /></span>
                  <span><strong>Quota corsi</strong><small>{courseAlreadyCovered ? `${statusLabel(payment.stato_pagamento)} per ${monthLabel(month)}` : `Residuo ${euro(payment.residuo)}`}</small></span>
                  <b>{courseAlreadyCovered ? 'Coperta' : euro(payment.residuo)}</b>
                </label>
              ) : null}

              {courseAlreadyCovered && payment.stato_pagamento !== 'gettone' ? (
                <div className="guided-payment-info"><BadgeCheck size={18} /> Il mese è già coperto. Se devi registrare un’altra quota, scegli il mese corretto sopra.</div>
              ) : null}

              {effectivePayCourses && !courseAlreadyCovered ? (
                <>
                  <div className="guided-payment-package-title">Scegli il tipo di pagamento</div>
                  <div className="guided-payment-packages">
                    {residueOption ? (
                      <button type="button" className={effectivePackageId === '__residue__' ? 'is-selected' : ''} onClick={() => choosePackage('__residue__')}>
                        <small>RESIDUO</small><strong>{residueOption.nome}</strong><b>{euro(residueOption.prezzo)}</b><span>{residueOption.descrizione}</span>
                      </button>
                    ) : null}
                    {!residueOption ? paymentPackages.map((item) => (
                      <button type="button" key={item.id || item.nome} className={String(effectivePackageId) === String(item.id) ? 'is-selected' : ''} onClick={() => choosePackage(String(item.id))}>
                        <small>{item.tipo === 'omaggio' ? 'OMAGGIO' : String(item.tipo || 'PACCHETTO').toUpperCase()}</small>
                        <strong>{item.nome}</strong>
                        <b>{item.tipo === 'omaggio' ? 'GRATIS' : euro(item.prezzo)}</b>
                        <span>{item.durata_mesi > 1 ? `${item.durata_mesi} mesi di copertura` : item.tipo === 'gettone' ? 'Lezione singola' : '1 mese di copertura'}</span>
                      </button>
                    )) : null}
                  </div>

                  {canPartial && selectedPackage?.tipo !== 'residuo' ? (
                    <label className="guided-payment-partial-toggle">
                      <input type="checkbox" checked={partialMode} onChange={(event) => setPartialMode(event.target.checked)} />
                      <span><strong>Incasso parziale</strong><small>Usalo se il corsista versa solo una parte della quota del mese.</small></span>
                    </label>
                  ) : null}

                  {!isGift ? (
                    <label className="guided-payment-field">
                      <span>Importo incassato ora</span>
                      <div><Euro size={18} /><input type="number" min="0" step="0.01" value={effectiveAmount} onChange={(event) => setAmount(event.target.value)} disabled={!partialMode && !isToken} /></div>
                      {amountInvalid ? <small className="is-error">L’importo non è valido per il saldo selezionato.</small> : null}
                    </label>
                  ) : (
                    <div className="guided-payment-gift-note"><Gift size={18} /> L’omaggio copre solo i corsi. La tessera corsista resta sempre esclusa.</div>
                  )}
                </>
              ) : null}

              {(effectivePayCourses || effectivePayMembership) ? (
                <div className="guided-payment-method-grid">
                  <label className="guided-payment-field">
                    <span>Metodo di pagamento</span>
                    <select value={method} onChange={(event) => setMethod(event.target.value)} disabled={totalCash <= 0}>
                      <option>Contanti</option>
                      <option>POS</option>
                      <option>Bonifico</option>
                      <option>Altro</option>
                    </select>
                  </label>
                  <label className="guided-payment-field">
                    <span>Nota facoltativa</span>
                    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Es. saldo ottobre" />
                  </label>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        <aside className="guided-payment-summary">
          <div className="guided-payment-summary-head"><CircleDollarSign size={20} /><div><small>Riepilogo</small><strong>Controlla e conferma</strong></div></div>
          <div className="guided-payment-summary-person">
            <span className="guided-payment-avatar">{selectedStudent ? initials(selectedStudent) : '?'}</span>
            <div><strong>{selectedStudent ? fullName(selectedStudent) : 'Nessun corsista'}</strong><small>{selectedStudent?.numero_tessera || 'Cerca una persona per iniziare'}</small></div>
          </div>
          <div className="guided-payment-summary-row"><span>Mese</span><b>{personReady ? monthLabel(month) : '—'}</b></div>
          <div className="guided-payment-summary-row"><span>Tessera</span><b>{effectivePayMembership ? euro(membershipCash) : euro(0)}</b></div>
          <div className="guided-payment-summary-row"><span>Corsi</span><b>{effectivePayCourses ? euro(courseAmount) : euro(0)}</b></div>
          <div className="guided-payment-summary-total"><span>Totale da registrare ora</span><strong>{euro(totalCash)}</strong><small>{totalCash <= 0 && isGift ? 'Omaggio corsi a 0 €' : method}</small></div>

          {saveMutation.isError ? <div className="guided-payment-error guided-payment-error--summary">{saveMutation.error?.message}</div> : null}

          <button type="button" className="guided-payment-confirm" disabled={!choiceReady || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <CheckCircle2 size={19} /> {saveMutation.isPending ? 'Registrazione…' : 'Registra pagamento'}
          </button>
          <small className="guided-payment-confirm-help">Un solo click aggiorna saldi, tessera e compensi collegati.</small>
        </aside>
      </div>

      {courseManagerOpen ? (
        <div className="guided-payment-course-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCourseManager() }}>
          <div className="guided-payment-course-modal" role="dialog" aria-modal="true" aria-label="Aggiungi o elimina corsi">
            <div className="guided-payment-course-modal-head">
              <div>
                <span><BookOpenCheck size={18} /> Gestione corsi</span>
                <h3>{fullName(selectedStudent)}</h3>
                <p>Le modifiche decorrono da <strong>{monthLabel(month)}</strong>. I mesi precedenti restano invariati.</p>
              </div>
              <button type="button" onClick={closeCourseManager} disabled={courseManagerMutation.isPending} aria-label="Chiudi"><X size={20} /></button>
            </div>

            {courseCatalogQuery.isLoading || courseDetailsQuery.isLoading ? (
              <div className="guided-payment-course-modal-loading">Carico i corsi…</div>
            ) : null}
            {courseCatalogQuery.isError || courseDetailsQuery.isError ? (
              <div className="guided-payment-error">Non riesco a caricare i corsi. Chiudi e riprova.</div>
            ) : null}

            {!courseCatalogQuery.isLoading && !courseDetailsQuery.isLoading ? (
              <div className="guided-payment-course-picker">
                {availableCourses.map((course) => {
                  const selected = courseDraftIds.includes(String(course.id))
                  return (
                    <button
                      type="button"
                      key={course.id}
                      className={selected ? 'is-selected' : ''}
                      onClick={() => toggleManagedCourse(course.id)}
                      disabled={courseManagerMutation.isPending}
                    >
                      <span className="guided-payment-course-picker-icon">{selected ? <Minus size={16} /> : <Plus size={16} />}</span>
                      <span>
                        <strong>{course.nome}</strong>
                        <small>{[course.livello, course.giorno_settimana, course.ora_inizio].filter(Boolean).join(' · ') || course.disciplina || 'Corso Orchidea'}</small>
                      </span>
                      <b>{selected ? 'Assegnato' : 'Aggiungi'}</b>
                    </button>
                  )
                })}
              </div>
            ) : null}

            {Number(payment?.pagato || 0) > 0 ? (
              <div className="guided-payment-course-modal-warning">Il mese ha già movimenti registrati. Dopo la modifica Nova ricalcolerà quota e residuo: controllali prima di incassare.</div>
            ) : null}
            {courseManagerMutation.isError ? <div className="guided-payment-error">{courseManagerMutation.error?.message}</div> : null}

            <div className="guided-payment-course-modal-actions">
              <button type="button" className="guided-payment-secondary" onClick={closeCourseManager} disabled={courseManagerMutation.isPending}>Annulla</button>
              <button
                type="button"
                className="guided-payment-primary"
                onClick={() => courseManagerMutation.mutate()}
                disabled={courseManagerMutation.isPending || courseCatalogQuery.isLoading || courseDetailsQuery.isLoading}
              >
                {courseManagerMutation.isPending ? 'Salvataggio…' : 'Salva corsi'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
