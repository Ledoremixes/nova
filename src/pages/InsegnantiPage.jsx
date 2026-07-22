import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, Clock3, Euro, GraduationCap, Link2, Mail, Pencil, Phone, Search, Trash2, X } from 'lucide-react'
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

function teacherPaymentSummary(row) {
  if (row.payment_type === 'fisso') return `Fisso mensile ${money(row.fixed_monthly_compensation)}`
  if (row.payment_type === 'orario') return `${Number(row.hourly_rate || 0)} €/h`
  return `${row.percentage_compensation || 0}% sulle quote pagate`
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-teachers'] })
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
    setForm({
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
    })
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function submit(e) {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ row: editing, payload: form })
    } else {
      createMutation.mutate(form)
    }
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

  const totalAssignedLinks = useMemo(() => courses.reduce((sum, course) => sum + (course.teachers?.length || 0), 0), [courses])

  return (
    <section className="page teachers-page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Staff didattico</div>
          <h2 className="dashboard-hero__title">Insegnanti</h2>
          <p className="dashboard-hero__text">Associa ogni corso a uno o più insegnanti e imposta il metodo di compenso: percentuale, fisso mensile oppure orario.</p>
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

                <div className="teacher-courses-preview">
                  <div className="teacher-courses-preview__head"><span>Corsi assegnati</span><strong>{assigned.length}</strong></div>
                  <div className="tagWrap">
                    {assigned.length ? assigned.slice(0, 4).map((course) => <span className="status-badge" key={course.id}>{course.nome}</span>) : <span className="simple-list__meta">Nessun corso assegnato</span>}
                    {assigned.length > 4 ? <span className="teacher-more-courses">+{assigned.length - 4} altri</span> : null}
                  </div>
                </div>

                <div className="rowActions teacher-card-actions">
                  <button className="actionBtn actionBtn--primary" onClick={() => { setSelectedTeacher(row); setCourseToAssign('') }}><GraduationCap size={15} /> Apri scheda</button>
                  {isAdmin ? <button className="actionBtn" onClick={() => openEdit(row)}><Pencil size={15} /> Modifica</button> : null}
                  {isAdmin ? <button className="actionBtn actionBtn--danger" onClick={() => remove(row)}><Trash2 size={15} /></button> : null}
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
                <p>Qui puoi associare più corsi allo stesso insegnante. Lo stesso corso può essere collegato anche ad altri insegnanti.</p>
              </div>
              <button className="topbar__button" onClick={() => setSelectedTeacher(null)}><X size={16} /> Chiudi</button>
            </div>

            <div className="teacher-detail-grid">
              <div className="teacher-panel">
                <h3>Dati e regola compenso</h3>
                <p><strong>Email:</strong> {selectedTeacher.email || '—'}</p>
                <p><strong>Telefono:</strong> {selectedTeacher.phone || '—'}</p>
                <p><strong>Metodo compenso:</strong> {selectedTeacher.payment_type === 'fisso' ? `Quota fissa mensile ${money(selectedTeacher.fixed_monthly_compensation)}` : selectedTeacher.payment_type === 'orario' ? `${Number(selectedTeacher.hourly_rate || 0)} €/h sulle ore del mese` : `${selectedTeacher.percentage_compensation || 0}% sul totale quote pagate`}</p>
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
          <div className="modalCard large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>{editing ? 'Modifica insegnante' : 'Nuovo insegnante'}</h3><p>Imposta dati principali e regola di compenso. I corsi si assegnano dalla scheda insegnante.</p></div></div>
            <form className="formGrid" onSubmit={submit}>
              <label>Nome completo<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label>Foto URL<input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></label>
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
              {(createMutation.error || updateMutation.error) ? <p className="form-error">{createMutation.error?.message || updateMutation.error?.message}</p> : null}
              <div className="modalActions"><button type="button" className="topbar__button" onClick={closeModal}>Annulla</button><button className="topbar__button topbar__button--primary" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Salva' : 'Crea'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
