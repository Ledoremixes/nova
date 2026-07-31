import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Download,
  Euro,
  FileText,
  GraduationCap,
  IdCard,
  Landmark,
  Link2,
  Mail,
  Pencil,
  Phone,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import {
  assignCourseToTeacher,
  createOrchideaTeacher,
  deleteOrchideaTeacher,
  fetchOrchideaCourses,
  fetchOrchideaTeachers,
  fetchTeacherMonthlyPayouts,
  removeCourseTeacher,
  updateOrchideaTeacher,
} from '../api/orchideaEntities'
import { generateTeacherContractPdf } from '../utils/teacherContractPdf'

const CONTRACT_DEFAULTS_KEY = 'nova.teacherContractDefaults.v2'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  bio: '',
  coursesText: '',
  photo_url: '',
  payment_type: 'percentuale',
  fixed_monthly_compensation: '',
  percentage_compensation: '',
  hourly_rate: '',
  active: true,
  tax_code: '',
  birth_date: '',
  birth_place: '',
  birth_province: '',
  residence_city: '',
  residence_province: '',
  residence_address: '',
  residence_postal_code: '',
  iban: '',
  bank_account_holder: '',
  contract_start_date: '2026-09-07',
  contract_end_date: '2027-06-30',
  contract_role: 'Istruttore/Allenatore',
  contract_discipline: '',
  contract_duties: 'Lezioni, preparazione tecnica e coreografica, assistenza agli allievi e attività connesse.',
  contract_venue: 'Club Orchidea ASD - Via Giuseppe Ungaretti 34, Saronno (VA)',
  contract_days_turns: '',
  contract_time_slots: '',
  contract_estimated_hours: '',
  contract_notice_days: 15,
  contract_compensation_frequency: 'mensile',
  contract_compensation_tax: 'lordo',
  contract_compensation_description: '',
  contract_signing_place: 'Saronno',
  contract_competent_court: '',
}

const organizationDefaults = {
  organization_name: 'Club Orchidea ASD',
  organization_address: 'Via Giuseppe Ungaretti 34',
  organization_city: 'Saronno (VA)',
  organization_tax_code: '14275140961',
  organization_rasd: '31102195',
  organization_affiliation: 'OPES',
  organization_representative: 'Manuel Ledonne',
  start_date: '2026-09-07',
  end_date: '2027-06-30',
  signing_place: 'Saronno',
}

function readContractDefaults() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONTRACT_DEFAULTS_KEY) || '{}')
    return { ...organizationDefaults, ...stored }
  } catch {
    return organizationDefaults
  }
}

function saveContractDefaults(form) {
  const payload = {
    organization_name: form.organization_name,
    organization_address: form.organization_address,
    organization_city: form.organization_city,
    organization_tax_code: form.organization_tax_code,
    organization_rasd: form.organization_rasd,
    organization_affiliation: form.organization_affiliation,
    organization_representative: form.organization_representative,
    start_date: form.start_date,
    end_date: form.end_date,
    signing_place: form.signing_place,
  }
  localStorage.setItem(CONTRACT_DEFAULTS_KEY, JSON.stringify(payload))
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

function money(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function norm(value) {
  return String(value || '').trim().toLowerCase()
}

function humanDate(value) {
  if (!value) return 'Non indicata'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('it-IT')
}

function teacherPaymentSummary(row) {
  if (row.payment_type === 'fisso') return `Fisso mensile ${money(row.fixed_monthly_compensation)}`
  if (row.payment_type === 'orario') return `${Number(row.hourly_rate || 0)} €/h`
  return `${row.percentage_compensation || 0}% sulle quote pagate`
}

function teacherToForm(row = {}) {
  return {
    ...emptyForm,
    full_name: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    bio: row.bio || '',
    coursesText: Array.isArray(row.courses) ? row.courses.join(', ') : '',
    photo_url: row.photo_url || '',
    payment_type: row.payment_type || 'percentuale',
    fixed_monthly_compensation: row.fixed_monthly_compensation ?? '',
    percentage_compensation: row.percentage_compensation ?? '',
    hourly_rate: row.hourly_rate ?? '',
    active: row.active !== false,
    tax_code: row.tax_code || '',
    birth_date: row.birth_date || '',
    birth_place: row.birth_place || '',
    birth_province: row.birth_province || '',
    residence_city: row.residence_city || '',
    residence_province: row.residence_province || '',
    residence_address: row.residence_address || '',
    residence_postal_code: row.residence_postal_code || '',
    iban: row.iban || '',
    bank_account_holder: row.bank_account_holder || row.full_name || '',
    contract_start_date: row.contract_start_date || emptyForm.contract_start_date,
    contract_end_date: row.contract_end_date || emptyForm.contract_end_date,
    contract_role: row.contract_role || emptyForm.contract_role,
    contract_discipline: row.contract_discipline || '',
    contract_duties: row.contract_duties || emptyForm.contract_duties,
    contract_venue: row.contract_venue || emptyForm.contract_venue,
    contract_days_turns: row.contract_days_turns || '',
    contract_time_slots: row.contract_time_slots || '',
    contract_estimated_hours: row.contract_estimated_hours || '',
    contract_notice_days: row.contract_notice_days ?? 15,
    contract_compensation_frequency: row.contract_compensation_frequency || 'mensile',
    contract_compensation_tax: row.contract_compensation_tax || 'lordo',
    contract_compensation_description: row.contract_compensation_description || '',
    contract_signing_place: row.contract_signing_place || 'Saronno',
    contract_competent_court: row.contract_competent_court || '',
  }
}

function courseScheduleSummary(assigned = []) {
  const days = [...new Set(assigned.map((course) => course.giorno_settimana).filter(Boolean))]
  const times = [...new Set(assigned.map((course) => {
    const start = String(course.ora_inizio || '').slice(0, 5)
    const end = String(course.ora_fine || '').slice(0, 5)
    return start && end ? `${start}-${end}` : start || end
  }).filter(Boolean))]
  return { days: days.join(', '), times: times.join(', ') }
}

function disciplineSummary(assigned = []) {
  const disciplines = [...new Set(assigned.map((course) => course.disciplina || course.nome).filter(Boolean))]
  return disciplines.join(', ')
}

function contractFormForTeacher(row, assigned = []) {
  const defaults = readContractDefaults()
  const schedule = courseScheduleSummary(assigned)
  return {
    organization_name: defaults.organization_name,
    organization_address: defaults.organization_address,
    organization_city: defaults.organization_city,
    organization_tax_code: defaults.organization_tax_code,
    organization_rasd: defaults.organization_rasd,
    organization_affiliation: defaults.organization_affiliation,
    organization_representative: defaults.organization_representative,
    full_name: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    tax_code: row.tax_code || '',
    birth_date: row.birth_date || '',
    birth_place: row.birth_place || '',
    birth_province: row.birth_province || '',
    residence_city: row.residence_city || '',
    residence_province: row.residence_province || '',
    residence_address: row.residence_address || '',
    residence_postal_code: row.residence_postal_code || '',
    iban: row.iban || '',
    bank_account_holder: row.bank_account_holder || row.full_name || '',
    start_date: row.contract_start_date || defaults.start_date,
    end_date: row.contract_end_date || defaults.end_date,
    role: row.contract_role || 'Istruttore/Allenatore',
    discipline: row.contract_discipline || disciplineSummary(assigned),
    duties: row.contract_duties || emptyForm.contract_duties,
    venue: row.contract_venue || emptyForm.contract_venue,
    days_turns: row.contract_days_turns || schedule.days,
    time_slots: row.contract_time_slots || schedule.times,
    estimated_hours: row.contract_estimated_hours || '',
    notice_days: row.contract_notice_days ?? 15,
    compensation_frequency: row.contract_compensation_frequency || 'mensile',
    compensation_tax: row.contract_compensation_tax || 'lordo',
    compensation_description: row.contract_compensation_description || '',
    signing_place: row.contract_signing_place || defaults.signing_place,
    signing_date: new Date().toISOString().slice(0, 10),
    competent_court: row.contract_competent_court || '',
  }
}

function payloadFromContract(row, contract) {
  return {
    ...teacherToForm(row),
    full_name: contract.full_name,
    email: contract.email,
    phone: contract.phone,
    tax_code: contract.tax_code,
    birth_date: contract.birth_date,
    birth_place: contract.birth_place,
    birth_province: contract.birth_province,
    residence_city: contract.residence_city,
    residence_province: contract.residence_province,
    residence_address: contract.residence_address,
    residence_postal_code: contract.residence_postal_code,
    iban: contract.iban,
    bank_account_holder: contract.bank_account_holder,
    contract_start_date: contract.start_date,
    contract_end_date: contract.end_date,
    contract_role: contract.role,
    contract_discipline: contract.discipline,
    contract_duties: contract.duties,
    contract_venue: contract.venue,
    contract_days_turns: contract.days_turns,
    contract_time_slots: contract.time_slots,
    contract_estimated_hours: contract.estimated_hours,
    contract_notice_days: contract.notice_days,
    contract_compensation_frequency: contract.compensation_frequency,
    contract_compensation_tax: contract.compensation_tax,
    contract_compensation_description: contract.compensation_description,
    contract_signing_place: contract.signing_place,
    contract_competent_court: contract.competent_court,
  }
}

const currentMonth = new Date().toISOString().slice(0, 7)

export default function InsegnantiPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(currentMonth)
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [courseToAssign, setCourseToAssign] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [contractTeacher, setContractTeacher] = useState(null)
  const [contractForm, setContractForm] = useState(null)

  const teachersQuery = useQuery({
    queryKey: ['orchidea-teachers', search],
    queryFn: () => fetchOrchideaTeachers({ search }),
  })

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-teachers'],
    queryFn: fetchOrchideaCourses,
  })

  const payoutsQuery = useQuery({
    queryKey: ['orchidea-teacher-payouts', month],
    queryFn: () => fetchTeacherMonthlyPayouts({ month }),
  })

  const createMutation = useMutation({
    mutationFn: createOrchideaTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-teachers'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ row, payload }) => updateOrchideaTeacher(row, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-teachers'] })
      if (selectedTeacher?.id === updated.id) setSelectedTeacher(updated)
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteOrchideaTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-teachers'] })
      setSelectedTeacher(null)
    },
  })

  const assignCourseMutation = useMutation({
    mutationFn: assignCourseToTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-courses-for-teachers'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
      setCourseToAssign('')
    },
  })

  const removeCourseTeacherMutation = useMutation({
    mutationFn: removeCourseTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-courses-for-teachers'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
    },
  })

  const teachers = teachersQuery.data || []
  const courses = useMemo(() => coursesQuery.data || [], [coursesQuery.data])
  const payouts = useMemo(() => payoutsQuery.data || [], [payoutsQuery.data])
  const payoutsByName = useMemo(() => new Map(payouts.map((item) => [norm(item.teacher_name), item])), [payouts])
  const totalPayouts = payouts.reduce((sum, item) => sum + Number(item.total || 0), 0)

  function teacherCourses(row) {
    const key = norm(row?.full_name)
    if (!key) return []
    return courses.filter((course) => (course.teachers || []).some((teacher) => norm(teacher.full_name) === key || String(teacher.id) === String(row.id)))
  }

  function availableCoursesFor(row) {
    const key = norm(row?.full_name)
    return courses.filter((course) => !(course.teachers || []).some((teacher) => norm(teacher.full_name) === key || String(teacher.id) === String(row.id)))
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setIsOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm(teacherToForm(row))
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function submit(e) {
    e.preventDefault()
    if (editing) updateMutation.mutate({ row: editing, payload: form })
    else createMutation.mutate(form)
  }

  function remove(row) {
    if (!window.confirm(`Eliminare ${row.full_name}?`)) return
    deleteMutation.mutate(row)
  }

  function assignSelectedCourse(e) {
    e.preventDefault()
    if (!selectedTeacher?.full_name || !courseToAssign) return
    assignCourseMutation.mutate({
      courseId: courseToAssign,
      teacherId: selectedTeacher.id,
      teacherName: selectedTeacher.full_name,
    })
  }

  function openContract(row) {
    if (!isAdmin) return
    const assigned = teacherCourses(row)
    setSelectedTeacher(null)
    setContractTeacher(row)
    setContractForm(contractFormForTeacher(row, assigned))
  }

  function closeContract() {
    setContractTeacher(null)
    setContractForm(null)
  }

  const contractMutation = useMutation({
    mutationFn: async () => {
      if (!contractTeacher || !contractForm) throw new Error('Insegnante non selezionato.')
      if (!contractForm.start_date || !contractForm.end_date) throw new Error('Inserisci data di inizio e fine contratto.')
      if (contractForm.end_date < contractForm.start_date) throw new Error('La data di fine deve essere successiva alla data di inizio.')
      if (!contractForm.full_name.trim()) throw new Error('Il nome dell’insegnante è obbligatorio.')
      if (!contractForm.tax_code.trim()) throw new Error('Inserisci il codice fiscale prima di generare il contratto.')
      if (!contractForm.residence_city.trim() || !contractForm.residence_address.trim()) throw new Error('Inserisci comune e indirizzo di residenza.')

      const assigned = teacherCourses(contractTeacher)
      const updated = await updateOrchideaTeacher(contractTeacher, payloadFromContract(contractTeacher, contractForm))
      saveContractDefaults(contractForm)
      await generateTeacherContractPdf({ teacher: updated, contract: contractForm, courses: assigned })
      return updated
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-teachers'] })
      closeContract()
    },
  })

  const totalAssignedLinks = useMemo(() => courses.reduce((sum, course) => sum + (course.teachers?.length || 0), 0), [courses])

  return (
    <section className="page teachers-page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Staff didattico</div>
          <h2 className="dashboard-hero__title">Insegnanti</h2>
          <p className="dashboard-hero__text">Associa ogni corso a uno o più insegnanti, conserva l’anagrafica fiscale e genera il contratto Co.Co.Co. pronto da stampare.</p>
        </div>
        <div className="teacher-month-filter">
          <label>Mese compensi<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          {isAdmin ? <button className="topbar__button topbar__button--primary" onClick={openCreate}>Nuovo insegnante</button> : null}
        </div>
      </div>

      <div className="stats-grid">
        <div className="page-card tesserati-stat-card"><span>Totale insegnanti</span><strong>{teachers.length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Attivi</span><strong>{teachers.filter((t) => t.active !== false).length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Assegnazioni corsi</span><strong>{totalAssignedLinks}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Compensi mese</span><strong>{money(totalPayouts)}</strong></div>
      </div>

      <div className="page-card">
        <div className="toolbar">
          <div className="searchWrapper"><Search size={18} /><input className="searchInput" placeholder="Cerca per nome, email o corso…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
        {teachersQuery.isLoading ? <p>Caricamento insegnanti…</p> : null}
        {teachersQuery.error ? <p className="form-error">Errore: {teachersQuery.error.message}</p> : null}
        {coursesQuery.error ? <p className="form-error">Errore corsi: {coursesQuery.error.message}</p> : null}

        <div className="cardsGrid teacher-card-grid">
          {teachers.map((row) => {
            const assigned = teacherCourses(row)
            const payout = payoutsByName.get(norm(row.full_name)) || { total: 0, rows: [], students_count: 0, courses_count: 0 }
            return (
              <article className="page-card teacher-profile-card" key={`${row._table}-${row.id}`}>
                <div className="teacher-profile-head">
                  {row.photo_url ? <img className="teacherAvatar teacherAvatar--large" src={row.photo_url} alt={row.full_name} /> : <div className="teacherAvatar teacherAvatar--large teacherAvatar--placeholder">{initials(row.full_name)}</div>}
                  <div className="teacher-profile-identity">
                    <div className="teacher-name-row">
                      <h3>{row.full_name}</h3>
                      <span className={row.active !== false ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{row.active !== false ? 'Attivo' : 'Non attivo'}</span>
                    </div>
                    <p>{row.bio || 'Nessuna bio inserita.'}</p>
                  </div>
                </div>

                <div className="teacher-compensation-rule">
                  <span>Regola compenso</span>
                  <strong>{teacherPaymentSummary(row)}</strong>
                </div>

                <div className="teacher-payout-card-inline">
                  <Euro size={18} />
                  <div><span>Da pagare nel mese</span><strong>{money(payout.total)}</strong><small>{payout.students_count || 0} allievi paganti · {assigned.length || 0} corsi assegnati</small></div>
                </div>

                <div className="teacher-contact-grid">
                  <div><Mail size={16} /><span><strong>Email</strong><em>{row.email || 'Non indicata'}</em></span></div>
                  <div><Phone size={16} /><span><strong>Telefono</strong><em>{row.phone || 'Non indicato'}</em></span></div>
                </div>

                {isAdmin ? (
                  <div className="teacher-admin-status">
                    <IdCard size={15} />
                    <span>{row.tax_code ? `CF ${row.tax_code}` : 'Anagrafica fiscale da completare'}</span>
                  </div>
                ) : null}

                <div className="teacher-courses-preview">
                  <div className="teacher-courses-preview__head"><span>Corsi assegnati</span><strong>{assigned.length}</strong></div>
                  <div className="tagWrap">
                    {assigned.length ? assigned.slice(0, 4).map((course) => <span className="status-badge" key={course.id}>{course.nome}</span>) : <span className="simple-list__meta">Nessun corso assegnato</span>}
                    {assigned.length > 4 ? <span className="teacher-more-courses">+{assigned.length - 4} altri</span> : null}
                  </div>
                </div>

                <div className={`rowActions teacher-card-actions ${isAdmin ? 'teacher-card-actions--admin' : ''}`}>
                  <button className="actionBtn actionBtn--primary" onClick={() => { setSelectedTeacher(row); setCourseToAssign('') }}><GraduationCap size={15} /> Apri scheda</button>
                  {isAdmin ? <button className="actionBtn" onClick={() => openEdit(row)}><Pencil size={15} /> Modifica</button> : null}
                  {isAdmin ? <button className="actionBtn teacher-contract-quick" onClick={() => openContract(row)}><FileText size={15} /> Contratto</button> : null}
                  {isAdmin ? <button className="actionBtn actionBtn--danger" aria-label={`Elimina ${row.full_name}`} onClick={() => remove(row)}><Trash2 size={15} /></button> : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {selectedTeacher ? (
        <div className="modalOverlay" onClick={() => setSelectedTeacher(null)}>
          <div className="modalCard teacher-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="teacher-detail-hero">
              <div>
                <div className="dashboard-hero__eyebrow">Scheda insegnante</div>
                <h3>{selectedTeacher.full_name}</h3>
                <p>Consulta dati, compensi e corsi collegati. Le informazioni fiscali sono visibili solo agli amministratori.</p>
              </div>
              <div className="teacher-detail-actions">
                {isAdmin ? <button className="topbar__button teacher-contract-button" onClick={() => openContract(selectedTeacher)}><FileText size={16} /> Genera contratto</button> : null}
                {isAdmin ? <button className="topbar__button" onClick={() => openEdit(selectedTeacher)}><Pencil size={16} /> Modifica dati</button> : null}
                <button className="topbar__button" onClick={() => setSelectedTeacher(null)}><X size={16} /> Chiudi</button>
              </div>
            </div>

            <div className="teacher-detail-grid">
              <div className="teacher-panel">
                <h3>Dati e regola compenso</h3>
                <p><strong>Email:</strong> {selectedTeacher.email || '—'}</p>
                <p><strong>Telefono:</strong> {selectedTeacher.phone || '—'}</p>
                <p><strong>Metodo compenso:</strong> {teacherPaymentSummary(selectedTeacher)}</p>
                <p><strong>Nota:</strong> {selectedTeacher.bio || '—'}</p>
              </div>

              <div className="teacher-panel teacher-payout-panel">
                <Clock3 size={32} />
                <h3>Compensi mese</h3>
                {(() => {
                  const payout = payoutsByName.get(norm(selectedTeacher.full_name)) || { total: 0, rows: [] }
                  return (
                    <div className="teacher-payout-detail">
                      <strong>{money(payout.total)}</strong>
                      <p>Calcolato sul mese selezionato, usando i corsi assegnati e le quote segnate come pagate.</p>
                      <div className="teacher-payout-list">
                        {(payout.rows || []).slice(0, 8).map((item) => (
                          <span key={item.enrollment_id}><em>{item.student_name}</em><b>{item.course_name}</b><strong>{money(item.teacher_quota)}</strong></span>
                        ))}
                        {(!payout.rows || payout.rows.length === 0) ? <small>Nessun compenso da mostrare nel mese selezionato.</small> : null}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {isAdmin ? (
                <div className="teacher-panel teacher-personal-panel">
                  <div className="teacher-panel-title"><UserRound size={22} /><div><h3>Anagrafica personale e fiscale</h3><p>Dati riservati agli amministratori e utilizzati per il contratto.</p></div></div>
                  <div className="teacher-personal-summary">
                    <p><strong>Codice fiscale</strong><span>{selectedTeacher.tax_code || 'Da inserire'}</span></p>
                    <p><strong>Nascita</strong><span>{selectedTeacher.birth_place || '—'} · {humanDate(selectedTeacher.birth_date)}</span></p>
                    <p><strong>Residenza</strong><span>{[selectedTeacher.residence_address, selectedTeacher.residence_postal_code, selectedTeacher.residence_city, selectedTeacher.residence_province].filter(Boolean).join(', ') || 'Da inserire'}</span></p>
                    <p><strong>IBAN</strong><span>{selectedTeacher.iban || 'Da inserire'}</span></p>
                    <p><strong>Periodo contratto</strong><span>{humanDate(selectedTeacher.contract_start_date)} - {humanDate(selectedTeacher.contract_end_date)}</span></p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="teacher-courses-manager">
              <div className="teacher-courses-manager__head">
                <div>
                  <div className="dashboard-hero__eyebrow">Corsi assegnati</div>
                  <h3>Collega corsi all’insegnante</h3>
                  <p>L’assegnazione è multipla: lo stesso corso può comparire anche nella scheda di altri insegnanti.</p>
                </div>
                <BookOpenCheck size={28} />
              </div>

              {isAdmin ? (
                <form className="teacher-assign-course-form" onSubmit={assignSelectedCourse}>
                  <label>
                    <span>Corso da assegnare</span>
                    <select value={courseToAssign} onChange={(e) => setCourseToAssign(e.target.value)}>
                      <option value="">Seleziona corso</option>
                      {availableCoursesFor(selectedTeacher).map((course) => (
                        <option value={course.id} key={course.id}>
                          {course.nome}{course.livello ? ` · ${course.livello}` : ''}{course.teacher_names?.length ? ` — già collegato a: ${course.teacher_names.join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="topbar__button topbar__button--primary" disabled={!courseToAssign || assignCourseMutation.isPending}>
                    <Link2 size={16} /> {assignCourseMutation.isPending ? 'Assegno…' : 'Assegna corso'}
                  </button>
                </form>
              ) : <p className="muted-text">Solo admin può assegnare o rimuovere corsi dagli insegnanti.</p>}

              {assignCourseMutation.error ? <p className="form-error">{assignCourseMutation.error.message}</p> : null}
              {removeCourseTeacherMutation.error ? <p className="form-error">{removeCourseTeacherMutation.error.message}</p> : null}

              <div className="teacher-course-list">
                {teacherCourses(selectedTeacher).length === 0 ? (
                  <div className="teacher-empty-courses"><BookOpenCheck size={26} /><strong>Nessun corso assegnato</strong><p>Assegna almeno un corso per calcolare correttamente i compensi.</p></div>
                ) : teacherCourses(selectedTeacher).map((course) => (
                  <div className="teacher-course-row" key={`${selectedTeacher.id}-${course.id}`}>
                    <div>
                      <strong>{course.nome}</strong>
                      <small>{course.livello || 'Livello non impostato'} · {money(course.prezzo_mensile)} prezzo originale · {course.participants_count || 0} partecipanti</small>
                      <small>Altri insegnanti collegati: {(course.teacher_names || []).filter((name) => norm(name) !== norm(selectedTeacher.full_name)).join(', ') || 'nessuno'}</small>
                    </div>
                    {isAdmin ? <button className="payments-icon-btn danger" onClick={() => removeCourseTeacherMutation.mutate({ courseId: course.id, teacherId: selectedTeacher.id, teacherName: selectedTeacher.full_name })} disabled={removeCourseTeacherMutation.isPending}><Trash2 size={15} /></button> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard large-modal teacher-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>{editing ? 'Modifica insegnante' : 'Nuovo insegnante'}</h3><p>Salva anagrafica, residenza, dati bancari e regola di compenso. I dati fiscali sono gestibili soltanto dall’admin.</p></div></div>
            <form className="formGrid teacher-master-form" onSubmit={submit}>
              <div className="teacher-form-section-title"><UserRound size={20} /><div><strong>Dati principali</strong><span>Contatti e informazioni visibili nella scheda.</span></div></div>
              <label>Nome completo<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label>Foto URL<input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></label>

              <div className="teacher-form-section-title"><IdCard size={20} /><div><strong>Anagrafica fiscale</strong><span>Dati riservati usati per compilare automaticamente il contratto.</span></div></div>
              <label>Codice fiscale<input value={form.tax_code} onChange={(e) => setForm({ ...form, tax_code: e.target.value.toUpperCase() })} maxLength={16} /></label>
              <label>Data di nascita<input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
              <label>Luogo di nascita<input value={form.birth_place} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></label>
              <label>Provincia di nascita<input value={form.birth_province} onChange={(e) => setForm({ ...form, birth_province: e.target.value.toUpperCase() })} maxLength={2} /></label>
              <label>Comune di residenza<input value={form.residence_city} onChange={(e) => setForm({ ...form, residence_city: e.target.value })} /></label>
              <label>Provincia di residenza<input value={form.residence_province} onChange={(e) => setForm({ ...form, residence_province: e.target.value.toUpperCase() })} maxLength={2} /></label>
              <label className="formFull">Indirizzo di residenza<input value={form.residence_address} onChange={(e) => setForm({ ...form, residence_address: e.target.value })} placeholder="Via/Piazza e numero civico" /></label>
              <label>CAP<input value={form.residence_postal_code} onChange={(e) => setForm({ ...form, residence_postal_code: e.target.value })} inputMode="numeric" maxLength={5} /></label>
              <label>IBAN<input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })} /></label>
              <label className="formFull">Intestatario conto<input value={form.bank_account_holder} onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })} /></label>

              <div className="teacher-form-section-title"><Euro size={20} /><div><strong>Regola compenso</strong><span>Parametri usati per il calcolo mensile e riportati nel contratto.</span></div></div>
              <label>Metodo compenso
                <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
                  <option value="percentuale">Percentuale sul totale quote pagate</option>
                  <option value="fisso">Quota fissa mensile</option>
                  <option value="orario">Pagamento orario</option>
                </select>
              </label>
              <label>Quota fissa mensile €<input type="number" step="0.01" value={form.fixed_monthly_compensation} onChange={(e) => setForm({ ...form, fixed_monthly_compensation: e.target.value })} placeholder="Es. 250" /></label>
              <label>Percentuale %<input type="number" step="0.01" value={form.percentage_compensation} onChange={(e) => setForm({ ...form, percentage_compensation: e.target.value })} placeholder="Es. 20" /></label>
              <label>Tariffa oraria €<input type="number" step="0.01" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} placeholder="Es. 25" /></label>
              <label className="formFull">Note interne / bio<textarea className="formTextarea" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
              <label className="check-card"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Insegnante attivo</label>
              {(createMutation.error || updateMutation.error) ? <p className="form-error formFull">{createMutation.error?.message || updateMutation.error?.message}</p> : null}
              <div className="modalActions"><button type="button" className="topbar__button" onClick={closeModal}>Annulla</button><button className="topbar__button topbar__button--primary" disabled={createMutation.isPending || updateMutation.isPending}><Save size={16} /> {editing ? 'Salva dati' : 'Crea insegnante'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {contractTeacher && contractForm ? (
        <div className="modalOverlay teacher-contract-overlay" onClick={closeContract}>
          <div className="modalCard teacher-contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="teacher-contract-hero">
              <div>
                <div className="dashboard-hero__eyebrow">Contratto di lavoro sportivo</div>
                <h3>Genera Co.Co.Co. - {contractTeacher.full_name}</h3>
                <p>I dati vengono salvati nella scheda insegnante e poi inseriti nel PDF con logo Orchidea.</p>
              </div>
              <button className="topbar__button" type="button" onClick={closeContract}><X size={16} /> Chiudi</button>
            </div>

            <div className="teacher-contract-warning">
              <FileText size={20} />
              <div><strong>Periodo preimpostato: 7 settembre 2026 - 30 giugno 2027.</strong><span>Il 31 giugno non esiste: Nova usa correttamente il 30 giugno. Le date restano sempre modificabili e vengono ricordate per i contratti successivi.</span></div>
            </div>

            <form className="teacher-contract-form" onSubmit={(e) => { e.preventDefault(); contractMutation.mutate() }}>
              <div className="contract-form-section">
                <div className="contract-form-section__title"><Landmark size={20} /><div><strong>Dati del committente</strong><span>Modificabili prima della generazione e memorizzati sul dispositivo.</span></div></div>
                <label>Denominazione<input value={contractForm.organization_name} onChange={(e) => setContractForm({ ...contractForm, organization_name: e.target.value })} /></label>
                <label>Legale rappresentante<input value={contractForm.organization_representative} onChange={(e) => setContractForm({ ...contractForm, organization_representative: e.target.value })} /></label>
                <label>Indirizzo<input value={contractForm.organization_address} onChange={(e) => setContractForm({ ...contractForm, organization_address: e.target.value })} /></label>
                <label>Città<input value={contractForm.organization_city} onChange={(e) => setContractForm({ ...contractForm, organization_city: e.target.value })} /></label>
                <label>C.F./P.IVA<input value={contractForm.organization_tax_code} onChange={(e) => setContractForm({ ...contractForm, organization_tax_code: e.target.value })} /></label>
                <label>Numero RASD<input value={contractForm.organization_rasd} onChange={(e) => setContractForm({ ...contractForm, organization_rasd: e.target.value })} /></label>
                <label>Affiliazione<input value={contractForm.organization_affiliation} onChange={(e) => setContractForm({ ...contractForm, organization_affiliation: e.target.value })} /></label>
              </div>

              <div className="contract-form-section">
                <div className="contract-form-section__title"><IdCard size={20} /><div><strong>Dati del collaboratore</strong><span>Vengono salvati in modo permanente nella scheda insegnante.</span></div></div>
                <label>Nome completo<input value={contractForm.full_name} onChange={(e) => setContractForm({ ...contractForm, full_name: e.target.value })} required /></label>
                <label>Codice fiscale<input value={contractForm.tax_code} onChange={(e) => setContractForm({ ...contractForm, tax_code: e.target.value.toUpperCase() })} maxLength={16} required /></label>
                <label>Email<input type="email" value={contractForm.email} onChange={(e) => setContractForm({ ...contractForm, email: e.target.value })} /></label>
                <label>Telefono<input value={contractForm.phone} onChange={(e) => setContractForm({ ...contractForm, phone: e.target.value })} /></label>
                <label>Data di nascita<input type="date" value={contractForm.birth_date} onChange={(e) => setContractForm({ ...contractForm, birth_date: e.target.value })} /></label>
                <label>Luogo di nascita<input value={contractForm.birth_place} onChange={(e) => setContractForm({ ...contractForm, birth_place: e.target.value })} /></label>
                <label>Provincia nascita<input value={contractForm.birth_province} onChange={(e) => setContractForm({ ...contractForm, birth_province: e.target.value.toUpperCase() })} maxLength={2} /></label>
                <label>Comune residenza<input value={contractForm.residence_city} onChange={(e) => setContractForm({ ...contractForm, residence_city: e.target.value })} required /></label>
                <label>Provincia residenza<input value={contractForm.residence_province} onChange={(e) => setContractForm({ ...contractForm, residence_province: e.target.value.toUpperCase() })} maxLength={2} /></label>
                <label>CAP<input value={contractForm.residence_postal_code} onChange={(e) => setContractForm({ ...contractForm, residence_postal_code: e.target.value })} maxLength={5} /></label>
                <label className="contract-span-2">Indirizzo residenza<input value={contractForm.residence_address} onChange={(e) => setContractForm({ ...contractForm, residence_address: e.target.value })} required /></label>
                <label>IBAN<input value={contractForm.iban} onChange={(e) => setContractForm({ ...contractForm, iban: e.target.value.toUpperCase() })} /></label>
                <label>Intestatario IBAN<input value={contractForm.bank_account_holder} onChange={(e) => setContractForm({ ...contractForm, bank_account_holder: e.target.value })} /></label>
              </div>

              <div className="contract-form-section">
                <div className="contract-form-section__title"><CalendarDays size={20} /><div><strong>Periodo e incarico</strong><span>Date e condizioni completamente modificabili per ogni stagione.</span></div></div>
                <label>Data inizio<input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} required /></label>
                <label>Data fine<input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} required /></label>
                <label>Ruolo<input value={contractForm.role} onChange={(e) => setContractForm({ ...contractForm, role: e.target.value })} /></label>
                <label>Disciplina<input value={contractForm.discipline} onChange={(e) => setContractForm({ ...contractForm, discipline: e.target.value })} /></label>
                <label className="contract-span-2">Sede di svolgimento<input value={contractForm.venue} onChange={(e) => setContractForm({ ...contractForm, venue: e.target.value })} /></label>
                <label className="contract-span-2">Mansioni<textarea value={contractForm.duties} onChange={(e) => setContractForm({ ...contractForm, duties: e.target.value })} /></label>
                <label>Giorni/turni<input value={contractForm.days_turns} onChange={(e) => setContractForm({ ...contractForm, days_turns: e.target.value })} /></label>
                <label>Fasce orarie<input value={contractForm.time_slots} onChange={(e) => setContractForm({ ...contractForm, time_slots: e.target.value })} /></label>
                <label>Ore stimate<input value={contractForm.estimated_hours} onChange={(e) => setContractForm({ ...contractForm, estimated_hours: e.target.value })} placeholder="Es. 8 ore settimanali" /></label>
                <label>Preavviso (giorni)<input type="number" min="0" value={contractForm.notice_days} onChange={(e) => setContractForm({ ...contractForm, notice_days: e.target.value })} /></label>
              </div>

              <div className="contract-form-section">
                <div className="contract-form-section__title"><Euro size={20} /><div><strong>Compenso e firma</strong><span>Se la descrizione resta vuota, Nova usa automaticamente il metodo di compenso della scheda.</span></div></div>
                <label>Periodicità
                  <select value={contractForm.compensation_frequency} onChange={(e) => setContractForm({ ...contractForm, compensation_frequency: e.target.value })}>
                    <option value="mensile">Mensile</option>
                    <option value="a lezione">A lezione</option>
                    <option value="a ore consuntivate">A ore consuntivate</option>
                    <option value="altro">Altro</option>
                  </select>
                </label>
                <label>Importo espresso come
                  <select value={contractForm.compensation_tax} onChange={(e) => setContractForm({ ...contractForm, compensation_tax: e.target.value })}>
                    <option value="lordo">Lordo</option>
                    <option value="netto">Netto</option>
                  </select>
                </label>
                <label className="contract-span-2">Descrizione compenso personalizzata<textarea value={contractForm.compensation_description} onChange={(e) => setContractForm({ ...contractForm, compensation_description: e.target.value })} placeholder={teacherPaymentSummary(contractTeacher)} /></label>
                <label>Luogo firma<input value={contractForm.signing_place} onChange={(e) => setContractForm({ ...contractForm, signing_place: e.target.value })} /></label>
                <label>Data firma<input type="date" value={contractForm.signing_date} onChange={(e) => setContractForm({ ...contractForm, signing_date: e.target.value })} /></label>
                <label className="contract-span-2">Foro competente facoltativo<input value={contractForm.competent_court} onChange={(e) => setContractForm({ ...contractForm, competent_court: e.target.value })} placeholder="Lascia vuoto per usare la formulazione secondo legge" /></label>
              </div>

              {contractMutation.error ? <p className="form-error contract-error">{contractMutation.error.message}</p> : null}
              <div className="teacher-contract-actions">
                <span>Il PDF viene generato sul dispositivo e non viene caricato online.</span>
                <button type="button" className="topbar__button" onClick={closeContract}>Annulla</button>
                <button className="topbar__button topbar__button--primary" disabled={contractMutation.isPending}><Download size={17} /> {contractMutation.isPending ? 'Salvo e genero…' : 'Salva dati e genera PDF'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
