import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  IdCard,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { fetchOrchideaCourses, fetchOrchideaStudents, addCourseParticipant } from '../api/orchideaEntities'
import { fetchTesseratoDetails, updateTesserato } from '../api/tesserati'
import { fetchPackagesCatalog } from '../api/packagesCatalog'
import {
  COURSE_MEMBERSHIP_FEE,
  fetchMembershipFeeRecords,
  markConvertedCorsistaMembership,
  resolveMembershipFeeState,
  setMembershipFeePaidAmount,
} from '../api/membershipFees'
import { setAllievoPackagePayment } from '../api/orchideaPayments'
import { createQuickCorsista } from '../api/studentEnrollment'
import { packagesForCourseSelection, resolveCoursePricing } from '../lib/coursePriceList'
import { enrollmentIsActiveForMonth } from '../lib/packagePricing'
import '../styles/IscrizioneCorsistaPage.css'

const currentMonth = dayjs().format('YYYY-MM')
const currentSeason = '2026/2027'
const SEPTEMBER_GIFT_PROMO_START = dayjs('2026-09-20')
const SEPTEMBER_GIFT_PROMO_END = dayjs('2026-09-30')

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

function money(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function monthLabel(month) {
  const parsed = dayjs(`${month}-01`)
  return parsed.isValid() ? parsed.format('MM/YYYY') : month
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isSeptemberPromoCourse(course = {}) {
  const text = normalizeSearch([
    course.nome,
    course.name,
    course.titolo,
    course.disciplina,
    course.tipo,
    course.livello,
  ].filter(Boolean).join(' '))
  const isBachataOrSalsa = /\b(bachata|salsa)\b/.test(text)
  const isBaseOrIntermediate = /\b(base|basic|intermedio|intermediate|interm)\b/.test(text)
  return isBachataOrSalsa && isBaseOrIntermediate
}

function normalizeQuickStudent(row = {}) {
  return {
    ...row,
    nomeCompleto: `${row.nome || ''} ${row.cognome || ''}`.trim(),
    telefono: row.telefono || row.cellulare || '',
    cf: row.cf || row.cod_fiscale || '',
    numero_tessera: row.numero_tessera || row.codice_tessera || '',
    is_corsista: row.is_corsista === true,
  }
}

function emptyForm() {
  return {
    nome: '',
    cognome: '',
    telefono: '',
    email: '',
    cf: '',
    nascita: '',
    luogo: '',
    residenza: '',
  }
}

export default function IscrizioneCorsistaPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const initialStudent = location.state?.student ? normalizeQuickStudent(location.state.student) : null
  const [search, setSearch] = useState(() => initialStudent ? fullName(initialStudent) : '')
  const [mode, setMode] = useState(() => initialStudent ? 'existing' : 'search')
  const [selectedStudent, setSelectedStudent] = useState(initialStudent)
  const [newForm, setNewForm] = useState(emptyForm)
  const [showExtraData, setShowExtraData] = useState(false)
  const [courseIds, setCourseIds] = useState([])
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [payMembershipNow, setPayMembershipNow] = useState(false)
  const [payPackageNow, setPayPackageNow] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('Contanti')
  const [result, setResult] = useState(null)

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
  })

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-atleti'],
    queryFn: fetchOrchideaCourses,
  })

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-catalog', { activeOnly: true }],
    queryFn: () => fetchPackagesCatalog({ includeInactive: false }),
  })

  const membershipQuery = useQuery({
    queryKey: ['membership-fee-records'],
    queryFn: fetchMembershipFeeRecords,
  })

  const detailsQuery = useQuery({
    queryKey: ['tesserato-details', selectedStudent?.id],
    queryFn: () => fetchTesseratoDetails(selectedStudent.id),
    enabled: Boolean(mode === 'existing' && selectedStudent?.id),
  })

  const students = useMemo(() => studentsQuery.data || [], [studentsQuery.data])


  const courses = useMemo(
    () => (coursesQuery.data || []).filter((course) => course.attivo !== false),
    [coursesQuery.data],
  )
  const packages = useMemo(() => packagesQuery.data || [], [packagesQuery.data])

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

  const existingEnrollmentIds = useMemo(() => {
    if (mode !== 'existing') return []
    return (detailsQuery.data?.enrollments || [])
      .filter((row) => enrollmentIsActiveForMonth(row, currentMonth))
      .map((row) => String(row.corso_id || row.corsi?.id || ''))
      .filter(Boolean)
  }, [detailsQuery.data, mode])

  const combinedCourseIds = useMemo(() => {
    return [...new Set([...existingEnrollmentIds, ...courseIds.map(String)])]
  }, [existingEnrollmentIds, courseIds])

  const chosenCourses = useMemo(() => {
    const idSet = new Set(combinedCourseIds.map(String))
    return courses.filter((course) => idSet.has(String(course.id)))
  }, [combinedCourseIds, courses])

  const paymentPackages = useMemo(
    () => packagesForCourseSelection(chosenCourses, packages),
    [chosenCourses, packages],
  )
  const recommendedMonthly = useMemo(
    () => resolveCoursePricing(chosenCourses, packages, 'mensile'),
    [chosenCourses, packages],
  )
  const giftPackage = paymentPackages.find((item) => item.tipo === 'omaggio') || null
  const promoToday = dayjs()
  const septemberGiftPromoEligible = Boolean(
    currentMonth === '2026-09'
    && !promoToday.isBefore(SEPTEMBER_GIFT_PROMO_START, 'day')
    && !promoToday.isAfter(SEPTEMBER_GIFT_PROMO_END, 'day')
    && existingEnrollmentIds.length === 0
    && chosenCourses.length > 0
    && chosenCourses.every(isSeptemberPromoCourse)
  )
  const effectivePackageId = selectedPackageId || (septemberGiftPromoEligible ? giftPackage?.id : recommendedMonthly?.id) || ''
  const selectedPackage = paymentPackages.find((item) => String(item.id) === String(effectivePackageId)) || recommendedMonthly || null
  const isGiftPackage = selectedPackage?.tipo === 'omaggio'

  const storedMembership = selectedStudent?.id
    ? (membershipQuery.data || []).find((row) => String(row.tesseramento_id) === String(selectedStudent.id))
    : null
  const membershipState = mode === 'new'
    ? resolveMembershipFeeState({ payment_status: 'unpaid' }, null)
    : resolveMembershipFeeState(selectedStudent || {}, storedMembership || null)
  const membershipRemaining = Number(membershipState.remaining || 0)
  const mustPayMembershipForGift = Boolean(isGiftPackage && membershipRemaining > 0)
  const membershipWillBePaid = Boolean(payMembershipNow || mustPayMembershipForGift)
  const packageWillBeRegistered = Boolean(isGiftPackage || payPackageNow)

  const packageStartMonth = selectedPackage && String(currentMonth).endsWith('-09') && Number(selectedPackage.durata_mesi || 1) > 1
    ? dayjs(`${currentMonth}-01`).add(1, 'month').format('YYYY-MM')
    : currentMonth

  const cashNow = (membershipWillBePaid ? membershipRemaining : 0) + (!isGiftPackage && payPackageNow ? Number(selectedPackage?.prezzo || 0) : 0)

  const isNewFormValid = Boolean(
    newForm.nome.trim()
    && newForm.cognome.trim()
    && newForm.telefono.trim()
    && newForm.email.trim().includes('@')
    && newForm.cf.trim().length >= 6,
  )
  const personReady = mode === 'existing' ? Boolean(selectedStudent?.id) : mode === 'new' ? isNewFormValid : false
  const canComplete = personReady && chosenCourses.length > 0 && Boolean(selectedPackage) && !detailsQuery.isLoading

  const completeMutation = useMutation({
    mutationFn: async () => {
      let student = selectedStudent
      let reusedExisting = false
      let firstAccessPassword = null

      if (mode === 'new') {
        const created = await createQuickCorsista({ ...newForm, stagione: currentSeason })
        student = normalizeQuickStudent(created.student)
        reusedExisting = created.existing === true
        firstAccessPassword = created.first_access_password || null
        if (reusedExisting) {
          const duplicateError = new Error('Questa persona era già presente. Ho aperto la sua anagrafica esistente: controlla i corsi e premi di nuovo “Completa iscrizione”.')
          duplicateError.existingStudent = student
          throw duplicateError
        }
      }

      if (!student?.id) throw new Error('Seleziona o crea un corsista prima di continuare.')

      const wasCorsista = student.is_corsista === true
      if (!wasCorsista && !membershipWillBePaid) {
        await markConvertedCorsistaMembership(student)
      }

      const updatedStudent = await updateTesserato(student.id, {
        ...student,
        is_corsista: true,
        stagione: currentSeason,
        tessera_attiva: true,
        status: membershipWillBePaid ? 'active' : (student.status || 'pending_payment'),
        payment_status: membershipWillBePaid ? 'paid' : (student.payment_status || 'unpaid'),
      })
      student = normalizeQuickStudent(updatedStudent)

      if (mode === 'new' && !membershipWillBePaid) {
        await setMembershipFeePaidAmount({
          studentId: student.id,
          paidAmount: 0,
          source: 'iscrizione_guidata_nova',
        })
      } else if (membershipWillBePaid && membershipRemaining > 0) {
        await setMembershipFeePaidAmount({
          studentId: student.id,
          paidAmount: COURSE_MEMBERSHIP_FEE,
          source: 'iscrizione_guidata_nova',
          chargedMonth: currentMonth,
        })
      }

      const oldCourseIds = new Set(existingEnrollmentIds.map(String))
      const coursesToAdd = combinedCourseIds.filter((courseId) => !oldCourseIds.has(String(courseId)))
      for (const courseId of coursesToAdd) {
        await addCourseParticipant({
          courseId,
          studentId: student.id,
          tariffaMensile: null,
          effectiveMonth: currentMonth,
        })
      }

      let packagePayment = null
      if (packageWillBeRegistered && selectedPackage) {
        packagePayment = await setAllievoPackagePayment({
          tesseramentoId: student.id,
          startMonth: packageStartMonth,
          packageItem: selectedPackage,
          amount: isGiftPackage ? 0 : Number(selectedPackage.prezzo || 0),
          method: isGiftPackage ? 'Omaggio' : paymentMethod,
          note: isGiftPackage
            ? `${selectedPackage.nome} registrato da Iscrizione corsista · tessera esclusa dall'omaggio`
            : `${selectedPackage.nome} registrato da Iscrizione corsista`,
        })
      }

      return {
        student,
        reusedExisting,
        firstAccessPassword,
        selectedCourses: chosenCourses,
        packageItem: selectedPackage,
        packagePayment,
        membershipPaid: membershipWillBePaid && membershipRemaining > 0,
        membershipCash: membershipWillBePaid ? membershipRemaining : 0,
        packageCash: !isGiftPackage && payPackageNow ? Number(selectedPackage?.prezzo || 0) : 0,
        totalCash: cashNow,
      }
    },
    onSuccess: async (data) => {
      setResult(data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orchidea-atleti-corsisti'] }),
        queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] }),
        queryClient.invalidateQueries({ queryKey: ['membership-fee-records'] }),
        queryClient.invalidateQueries({ queryKey: ['nova-membership-fees'] }),
        queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] }),
      ])
    },
    onError: (error) => {
      if (error?.existingStudent?.id) {
        setSelectedStudent(error.existingStudent)
        setMode('existing')
        setSelectedPackageId('')
        setPayMembershipNow(false)
        setPayPackageNow(false)
      }
    },
  })

  function selectExisting(student) {
    setMode('existing')
    setSelectedStudent(student)
    setCourseIds([])
    setSelectedPackageId('')
    setPayMembershipNow(false)
    setPayPackageNow(false)
    setResult(null)
  }

  function startNew() {
    setMode('new')
    setSelectedStudent(null)
    setNewForm(emptyForm())
    setCourseIds([])
    setSelectedPackageId('')
    setPayMembershipNow(false)
    setPayPackageNow(false)
    setShowExtraData(false)
    setResult(null)
  }

  function backToSearch() {
    setMode('search')
    setSelectedStudent(null)
    setCourseIds([])
    setSelectedPackageId('')
    setPayMembershipNow(false)
    setPayPackageNow(false)
    setResult(null)
  }

  function resetAll() {
    setSearch('')
    setMode('search')
    setSelectedStudent(null)
    setNewForm(emptyForm())
    setCourseIds([])
    setSelectedPackageId('')
    setPayMembershipNow(false)
    setPayPackageNow(false)
    setShowExtraData(false)
    setResult(null)
    completeMutation.reset()
  }

  function toggleCourse(courseId) {
    const id = String(courseId)
    if (existingEnrollmentIds.includes(id)) return
    setCourseIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setSelectedPackageId('')
    setPayPackageNow(false)
  }

  if (result) {
    return (
      <section className="enrollment-page">
        <div className="enrollment-success-card">
          <span className="enrollment-success-icon"><CheckCircle2 size={34} /></span>
          <div className="enrollment-success-eyebrow">Iscrizione completata</div>
          <h1>{fullName(result.student)}</h1>
          <p>Nova ha aggiornato anagrafica, corsi, tessera e pagamento senza passare da altre sezioni.</p>

          <div className="enrollment-success-grid">
            <div><span>Corsi</span><strong>{result.selectedCourses.length}</strong><small>{result.selectedCourses.map((course) => course.nome).join(' · ')}</small></div>
            <div><span>Pacchetto</span><strong>{result.packageItem?.nome || '—'}</strong><small>{result.packagePayment ? (result.packageItem?.tipo === 'omaggio' ? `Omaggio registrato · ${monthLabel(packageStartMonth)}` : `Pagato · decorrenza ${monthLabel(packageStartMonth)}`) : 'Da incassare'}</small></div>
            <div><span>Tessera corsista</span><strong>{result.membershipPaid || membershipRemaining <= 0 ? 'Pagata' : 'Da pagare'}</strong><small>{result.membershipPaid ? `${money(result.membershipCash)} registrati` : 'Resta visibile in rosso nei Pagamenti'}</small></div>
            <div><span>Incassato ora</span><strong>{money(result.totalCash)}</strong><small>{result.totalCash > 0 ? paymentMethod : 'Nessun incasso registrato'}</small></div>
          </div>

          {result.firstAccessPassword ? (
            <div className="enrollment-first-access">
              <IdCard size={20} />
              <div><strong>Accesso area allievi creato</strong><span>Al primo accesso il corsista usa il proprio codice fiscale come password.</span></div>
            </div>
          ) : null}

          {result.reusedExisting ? (
            <div className="enrollment-reused-note"><BadgeCheck size={18} /> L’anagrafica era già presente: Nova l’ha riutilizzata senza creare un duplicato.</div>
          ) : null}

          <div className="enrollment-success-actions">
            <button type="button" className="enrollment-secondary-button" onClick={() => navigate('/atleti')}>Vai a Corsisti</button>
            <button type="button" className="enrollment-secondary-button" onClick={() => navigate('/pagamenti')}>Vai ai Pagamenti</button>
            <button type="button" className="enrollment-primary-button" onClick={resetAll}><Plus size={18} /> Nuova iscrizione</button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="enrollment-page">
      <div className="enrollment-hero">
        <div>
          <span className="enrollment-eyebrow"><Sparkles size={15} /> Flusso rapido segreteria</span>
          <h1>Iscrizione corsista</h1>
          <p>Una sola schermata per trovare o creare il corsista, assegnare i corsi, scegliere il pacchetto e registrare l’incasso.</p>
        </div>
        <div className="enrollment-hero-badge"><UserPlus size={21} /><span><strong>4 passaggi</strong><small>senza cambiare sezione</small></span></div>
      </div>

      <div className="enrollment-step-strip">
        <span className={personReady ? 'is-done' : 'is-active'}><b>{personReady ? <Check size={15} /> : '1'}</b> Persona</span>
        <i />
        <span className={chosenCourses.length ? 'is-done' : personReady ? 'is-active' : ''}><b>{chosenCourses.length ? <Check size={15} /> : '2'}</b> Corsi</span>
        <i />
        <span className={selectedPackage ? 'is-done' : chosenCourses.length ? 'is-active' : ''}><b>{selectedPackage ? <Check size={15} /> : '3'}</b> Pacchetto</span>
        <i />
        <span className={selectedPackage ? 'is-active' : ''}><b>4</b> Incasso</span>
      </div>

      <div className="enrollment-layout">
        <div className="enrollment-main-column">
          <article className="enrollment-card enrollment-person-card">
            <div className="enrollment-card-head">
              <span className="enrollment-step-icon"><UserCheck size={22} /></span>
              <div><span>Passaggio 1</span><h2>Chi stai iscrivendo?</h2><p>Cerca sempre prima la persona: se era già tesserata non devi riscrivere i dati.</p></div>
              {mode !== 'search' ? <button type="button" className="enrollment-text-button" onClick={backToSearch}><ArrowLeft size={16} /> Cambia persona</button> : null}
            </div>

            {mode === 'search' ? (
              <div className="enrollment-search-block">
                <label className="enrollment-search-input">
                  <Search size={21} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, telefono, codice fiscale o tessera…" autoFocus />
                </label>

                {search.trim().length >= 2 ? (
                  <div className="enrollment-search-results">
                    {studentsQuery.isLoading ? <div className="enrollment-search-empty">Cerco nell’anagrafica…</div> : null}
                    {!studentsQuery.isLoading && matches.map((student) => (
                      <button type="button" className="enrollment-person-result" key={student.id} onClick={() => selectExisting(student)}>
                        <span className="enrollment-avatar">{initials(student)}</span>
                        <span className="enrollment-person-copy"><strong>{fullName(student)}</strong><small>{student.telefono || student.email || student.cf || 'Nessun contatto'}</small></span>
                        <span className={student.is_corsista ? 'enrollment-mini-pill is-ok' : 'enrollment-mini-pill'}>{student.is_corsista ? 'Corsista' : 'Tesserato'}</span>
                        <span className="enrollment-select-label">Seleziona</span>
                      </button>
                    ))}
                    {!studentsQuery.isLoading && matches.length === 0 ? <div className="enrollment-search-empty">Nessuna persona trovata. Puoi crearla rapidamente qui sotto.</div> : null}
                  </div>
                ) : (
                  <div className="enrollment-search-tip"><UsersRound size={18} /> Bastano 2 lettere o alcune cifre del telefono.</div>
                )}

                <button type="button" className="enrollment-new-person-button" onClick={startNew}><UserPlus size={20} /><span><strong>Nuovo corsista</strong><small>Inserisci solo i dati essenziali, gli altri si possono completare anche dopo.</small></span></button>
              </div>
            ) : null}

            {mode === 'existing' && selectedStudent ? (
              <div className="enrollment-selected-person">
                <span className="enrollment-avatar enrollment-avatar--large">{initials(selectedStudent)}</span>
                <div className="enrollment-selected-copy">
                  <span className="enrollment-selected-label">Anagrafica trovata</span>
                  <h3>{fullName(selectedStudent)}</h3>
                  <div className="enrollment-contact-row">
                    <span><Phone size={15} /> {selectedStudent.telefono || 'Telefono non indicato'}</span>
                    <span><Mail size={15} /> {selectedStudent.email || 'Email non indicata'}</span>
                    <span><IdCard size={15} /> {selectedStudent.cf || 'CF non indicato'}</span>
                  </div>
                </div>
                <span className="enrollment-ok-badge"><CheckCircle2 size={17} /> Nessun dato da riscrivere</span>
              </div>
            ) : null}

            {mode === 'new' ? (
              <div className="enrollment-quick-form">
                <div className="enrollment-quick-note"><Sparkles size={18} /><span><strong>Iscrizione rapida</strong> — questi 5 campi bastano per creare l’anagrafica e l’accesso all’area allievi.</span></div>
                <div className="enrollment-form-grid">
                  <label><span>Nome *</span><input value={newForm.nome} onChange={(event) => setNewForm({ ...newForm, nome: event.target.value })} autoComplete="off" /></label>
                  <label><span>Cognome *</span><input value={newForm.cognome} onChange={(event) => setNewForm({ ...newForm, cognome: event.target.value })} autoComplete="off" /></label>
                  <label><span>Telefono *</span><input inputMode="tel" value={newForm.telefono} onChange={(event) => setNewForm({ ...newForm, telefono: event.target.value })} autoComplete="off" /></label>
                  <label><span>Codice fiscale *</span><input value={newForm.cf} onChange={(event) => setNewForm({ ...newForm, cf: event.target.value.toUpperCase() })} autoComplete="off" /></label>
                  <label className="is-wide"><span>Email *</span><input type="email" value={newForm.email} onChange={(event) => setNewForm({ ...newForm, email: event.target.value })} autoComplete="off" /></label>
                </div>

                <button type="button" className="enrollment-extra-toggle" onClick={() => setShowExtraData((value) => !value)}>
                  <span><MapPin size={17} /> Aggiungi subito i dati anagrafici facoltativi</span>{showExtraData ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showExtraData ? (
                  <div className="enrollment-form-grid enrollment-form-grid--extra">
                    <label><span>Data di nascita</span><input type="date" value={newForm.nascita} onChange={(event) => setNewForm({ ...newForm, nascita: event.target.value })} /></label>
                    <label><span>Luogo di nascita</span><input value={newForm.luogo} onChange={(event) => setNewForm({ ...newForm, luogo: event.target.value })} autoComplete="off" /></label>
                    <label className="is-wide"><span>Residenza / indirizzo</span><input value={newForm.residenza} onChange={(event) => setNewForm({ ...newForm, residenza: event.target.value })} autoComplete="off" /></label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          {personReady ? (
            <article className="enrollment-card">
              <div className="enrollment-card-head">
                <span className="enrollment-step-icon"><UsersRound size={22} /></span>
                <div><span>Passaggio 2</span><h2>Quali corsi frequenta?</h2><p>Tocca i corsi. Quelli già assegnati rimangono protetti e non vengono duplicati.</p></div>
              </div>

              {detailsQuery.isLoading && mode === 'existing' ? <div className="enrollment-loading-row">Controllo i corsi già collegati…</div> : null}
              <div className="enrollment-course-grid">
                {courses.map((course) => {
                  const id = String(course.id)
                  const alreadyAssigned = existingEnrollmentIds.includes(id)
                  const checked = alreadyAssigned || courseIds.includes(id)
                  return (
                    <button type="button" key={course.id} className={`enrollment-course-choice ${checked ? 'is-selected' : ''} ${alreadyAssigned ? 'is-locked' : ''}`} onClick={() => toggleCourse(id)}>
                      <span className="enrollment-course-check">{checked ? <Check size={17} /> : null}</span>
                      <span><strong>{course.nome}</strong><small>{[course.livello, course.giorno_settimana, course.ora_inizio].filter(Boolean).join(' · ') || course.disciplina || 'Corso attivo'}</small></span>
                      {alreadyAssigned ? <em>Già assegnato</em> : null}
                    </button>
                  )
                })}
              </div>
            </article>
          ) : null}

          {personReady && chosenCourses.length > 0 ? (
            <article className="enrollment-card">
              <div className="enrollment-card-head">
                <span className="enrollment-step-icon"><PackageCheck size={22} /></span>
                <div><span>Passaggio 3</span><h2>Scegli il pacchetto</h2><p>Nova propone automaticamente il listino corretto in base ai corsi selezionati.</p></div>
              </div>

              <div className="enrollment-recommendation">
                <Sparkles size={19} />
                <div><span>Listino rilevato</span><strong>{recommendedMonthly?.pricing_group_label || 'Pacchetto corsi'}</strong></div>
              </div>

              {septemberGiftPromoEligible ? (
                <div className="enrollment-promo-banner">
                  <Sparkles size={21} />
                  <div><strong>Promo settembre attiva: mese omaggio</strong><span>Iscrizione dopo le 2 settimane di prova per Bachata/Salsa base o intermedio. Nova ha già proposto “Omaggio”. La tessera corsista da 25 € resta sempre obbligatoria.</span></div>
                </div>
              ) : null}

              <div className="enrollment-package-grid">
                {paymentPackages.map((item) => {
                  const selected = String(item.id) === String(effectivePackageId)
                  const recommended = String(item.id) === String(recommendedMonthly?.id)
                  const gift = item.tipo === 'omaggio'
                  return (
                    <button type="button" className={`enrollment-package-choice ${selected ? 'is-selected' : ''} ${gift ? 'is-gift' : ''}`} key={item.id || item.nome} onClick={() => { setSelectedPackageId(item.id); setPayPackageNow(false) }}>
                      <span className="enrollment-package-top"><em>{gift ? 'Omaggio' : item.tipo === 'gettone' ? 'Lezione singola' : item.tipo}</em>{gift && septemberGiftPromoEligible ? <b>Promo settembre</b> : recommended && !septemberGiftPromoEligible ? <b>Consigliato</b> : null}</span>
                      <strong>{item.nome}</strong>
                      <span className="enrollment-package-price">{gift ? 'GRATIS' : money(item.prezzo)}</span>
                      <small>{gift ? 'Copre 1 mese di corsi a 0 € · la tessera da 25 € è sempre esclusa' : item.tipo === 'gettone' ? 'Non chiude il mese' : `${Math.max(1, Number(item.durata_mesi || 1))} ${Number(item.durata_mesi || 1) === 1 ? 'mese' : 'mesi'} di copertura`}</small>
                    </button>
                  )
                })}
              </div>

              {selectedPackage && packageStartMonth !== currentMonth ? (
                <div className="enrollment-package-warning"><CalendarRange size={18} /><span><strong>Decorrenza da {monthLabel(packageStartMonth)}.</strong> Il mese di settembre resta separato, come nella sezione Pagamenti.</span></div>
              ) : null}
            </article>
          ) : null}

          {personReady && chosenCourses.length > 0 && selectedPackage ? (
            <article className="enrollment-card">
              <div className="enrollment-card-head">
                <span className="enrollment-step-icon"><WalletCards size={22} /></span>
                <div><span>Passaggio 4</span><h2>Cosa sta pagando adesso?</h2><p>Spunta solo quello che stai realmente incassando. Il resto rimane automaticamente da pagare.</p></div>
              </div>

              <div className="enrollment-pay-list">
                <label className={`enrollment-pay-row ${membershipRemaining <= 0 ? 'is-paid' : membershipWillBePaid ? 'is-checked' : ''} ${mustPayMembershipForGift ? 'is-required' : ''}`}>
                  <input type="checkbox" checked={membershipRemaining <= 0 || membershipWillBePaid} disabled={membershipRemaining <= 0 || mustPayMembershipForGift} onChange={(event) => setPayMembershipNow(event.target.checked)} />
                  <span className="enrollment-pay-icon"><ShieldCheck size={21} /></span>
                  <span className="enrollment-pay-copy">
                    <strong>Tessera corsista {mustPayMembershipForGift ? '· obbligatoria' : ''}</strong>
                    <small>{membershipRemaining <= 0 ? 'Già pagata' : mustPayMembershipForGift ? `L’omaggio copre solo i corsi: devi incassare ${money(membershipRemaining)} di tessera.` : membershipState.paid_amount > 0 ? `Già versati ${money(membershipState.paid_amount)} · resta la differenza` : 'Quota assicurativa da 25 €'}</small>
                  </span>
                  <strong className="enrollment-pay-amount">{membershipRemaining <= 0 ? 'Pagata' : money(membershipRemaining)}</strong>
                </label>

                {isGiftPackage ? (
                  <div className="enrollment-pay-row enrollment-pay-row--gift is-checked">
                    <span className="enrollment-gift-check"><Check size={17} /></span>
                    <span className="enrollment-pay-icon"><Sparkles size={21} /></span>
                    <span className="enrollment-pay-copy"><strong>{selectedPackage.nome}</strong><small>Corso coperto gratuitamente per {monthLabel(packageStartMonth)}. Nessun incasso corsi.</small></span>
                    <strong className="enrollment-pay-amount">0,00 €</strong>
                  </div>
                ) : (
                  <label className={`enrollment-pay-row ${payPackageNow ? 'is-checked' : ''}`}>
                    <input type="checkbox" checked={payPackageNow} onChange={(event) => setPayPackageNow(event.target.checked)} />
                    <span className="enrollment-pay-icon"><PackageCheck size={21} /></span>
                    <span className="enrollment-pay-copy"><strong>{selectedPackage.nome}</strong><small>{packageStartMonth === currentMonth ? `Decorrenza ${monthLabel(currentMonth)}` : `Decorrenza ${monthLabel(packageStartMonth)}`}</small></span>
                    <strong className="enrollment-pay-amount">{money(selectedPackage.prezzo)}</strong>
                  </label>
                )}
              </div>

              {cashNow > 0 ? (
                <div className="enrollment-method-row">
                  <label><span>{isGiftPackage ? 'Metodo pagamento tessera' : 'Metodo di pagamento'}</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Contanti</option><option>POS</option><option>Bonifico</option><option>SumUp</option><option>Altro</option></select></label>
                </div>
              ) : null}
            </article>
          ) : null}

          {completeMutation.error ? <div className="enrollment-error"><strong>Non sono riuscito a completare l’iscrizione.</strong><span>{completeMutation.error.message}</span></div> : null}
        </div>

        <aside className="enrollment-summary-card">
          <div className="enrollment-summary-head"><CircleDollarSign size={23} /><div><span>Riepilogo</span><strong>Controlla e conferma</strong></div></div>

          <div className="enrollment-summary-person">
            <span className="enrollment-avatar">{mode === 'existing' && selectedStudent ? initials(selectedStudent) : mode === 'new' && newForm.nome ? `${newForm.nome[0] || ''}${newForm.cognome[0] || ''}`.toUpperCase() : '?'}</span>
            <div><strong>{mode === 'existing' && selectedStudent ? fullName(selectedStudent) : mode === 'new' ? `${newForm.nome} ${newForm.cognome}`.trim() || 'Nuovo corsista' : 'Nessun corsista'}</strong><small>{mode === 'existing' ? (selectedStudent?.numero_tessera || 'Anagrafica esistente') : mode === 'new' ? 'Nuova anagrafica' : 'Cerca una persona per iniziare'}</small></div>
          </div>

          <div className="enrollment-summary-section">
            <span>Corsi</span>
            {chosenCourses.length ? chosenCourses.map((course) => <small key={course.id}><Check size={14} /> {course.nome}</small>) : <em>Nessun corso selezionato</em>}
          </div>

          <div className="enrollment-summary-section">
            <span>Pacchetto</span>
            {selectedPackage ? <><strong>{selectedPackage.nome}</strong><small>{isGiftPackage ? `0 € corsi · ${monthLabel(packageStartMonth)} · tessera esclusa` : `${money(selectedPackage.prezzo)} · da ${monthLabel(packageStartMonth)}`}</small></> : <em>Da scegliere</em>}
          </div>

          <div className="enrollment-summary-section enrollment-summary-payments">
            <span>Incasso di oggi</span>
            <div><small>Tessera</small><strong>{membershipWillBePaid ? money(membershipRemaining) : money(0)}</strong></div>
            <div><small>Pacchetto</small><strong>{isGiftPackage ? 'Omaggio' : payPackageNow ? money(selectedPackage?.prezzo || 0) : money(0)}</strong></div>
          </div>

          <div className="enrollment-summary-total"><span>Totale da registrare ora</span><strong>{money(cashNow)}</strong><small>{cashNow > 0 ? paymentMethod : isGiftPackage ? 'Mese corsi omaggio · nessun incasso' : 'Puoi salvare anche senza incassare'}</small></div>

          <button type="button" className="enrollment-complete-button" disabled={!canComplete || completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            {completeMutation.isPending ? 'Sto completando…' : <><CheckCircle2 size={19} /> Completa iscrizione</>}
          </button>
          {!canComplete ? <p className="enrollment-summary-help">Seleziona la persona e almeno un corso per continuare.</p> : <p className="enrollment-summary-help">Un solo click aggiorna tutte le sezioni di Nova.</p>}
        </aside>
      </div>
    </section>
  )
}
