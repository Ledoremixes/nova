import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { BookOpenCheck, Calculator, Euro, PackageCheck, Percent, Plus, Save, Search, Sparkles, Trash2, UserRoundCheck } from 'lucide-react'
import { fetchAllieviPaymentsMonth, euro } from '../api/orchideaPayments'
import { addCourseParticipant, fetchOrchideaCourses, fetchOrchideaTeachers, fetchStudentPackageDetails, removeCourseParticipant, saveStudentPackage } from '../api/orchideaEntities'
import '../styles/PacchettiPage.css'

const currentMonth = dayjs().format('YYYY-MM')

function initials(row) {
  return String(row.nomeCompleto || row.nome_completo || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'
}

function monthLabel(month) {
  const [year, monthNumber] = String(month || currentMonth).split('-').map(Number)
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(year, (monthNumber || 1) - 1, 1))
}

function numeric(value) {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function enrollmentAmount(row) {
  return Math.max(0, numeric(row.quota_allievo_mensile ?? row.tariffa_mensile ?? row.corsi?.prezzo_mensile))
}

function teacherAmount(row) {
  if (row.quota_insegnante_mensile !== null && row.quota_insegnante_mensile !== undefined && row.quota_insegnante_mensile !== '') {
    return Math.max(0, numeric(row.quota_insegnante_mensile))
  }
  if (row.percentuale_insegnante) return Math.max(0, enrollmentAmount(row) * numeric(row.percentuale_insegnante) / 100)
  return 0
}

function teacherKey(value) {
  return String(value || '').trim().toLowerCase()
}

function teacherRuleForName(teachers, name) {
  const names = String(name || '')
    .split(/,|&|\//)
    .map((item) => teacherKey(item))
    .filter(Boolean)
  for (const key of names) {
    const found = teachers.find((teacher) => teacherKey(teacher.full_name) === key)
    if (found) return found
  }
  return null
}

function applyTeacherRuleToRow(row, teachers) {
  const teacher = teacherRuleForName(teachers, row.insegnante)
  const quota = numeric(row.quota_allievo_mensile)

  if (!teacher) {
    return { ...row, teacher_payment_type: 'none' }
  }

  const paymentType = teacher.payment_type || 'percentuale'
  if (paymentType === 'fisso') {
    const fixed = numeric(teacher.fixed_monthly_compensation)
    return {
      ...row,
      teacher_payment_type: 'fisso',
      quota_insegnante_mensile: fixed ? fixed.toFixed(2) : '',
      percentuale_insegnante: '',
    }
  }

  const percent = numeric(teacher.percentage_compensation)
  return {
    ...row,
    teacher_payment_type: 'percentuale',
    percentuale_insegnante: percent ? String(percent) : '',
    quota_insegnante_mensile: percent ? (quota * percent / 100).toFixed(2) : '',
  }
}

function prepareEnrollment(row) {
  const originalPrice = Math.max(0, numeric(row.corsi?.prezzo_mensile ?? row.prezzo_corso ?? row.corsi?.prezzo ?? row.tariffa_mensile ?? row.quota_allievo_mensile))
  const quotaAllievo = enrollmentAmount(row)
  return {
    id: row.id,
    corso_id: row.corso_id,
    nome: row.corsi?.nome || row.nome || 'Corso',
    livello: row.corsi?.livello || row.livello || '',
    insegnante: row.corsi?.teacher_names?.join(', ') || row.corsi?.insegnante || row.insegnante || 'Senza insegnante',
    prezzo_corso: originalPrice ? originalPrice.toFixed(2) : '',
    quota_allievo_mensile: quotaAllievo ? quotaAllievo.toFixed(2) : '',
    quota_insegnante_mensile: teacherAmount(row) ? teacherAmount(row).toFixed(2) : '',
    percentuale_insegnante: row.percentuale_insegnante ?? '',
    teacher_payment_type: row.quota_insegnante_mensile ? 'manuale' : (row.percentuale_insegnante ? 'percentuale' : 'none'),
    pacchetto_nome: row.pacchetto_nome || '',
    pacchetto_totale_mensile: row.pacchetto_totale_mensile ?? '',
    note_pacchetto: row.note_pacchetto || '',
  }
}

export default function PacchettiPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [packageName, setPackageName] = useState('Pacchetto mensile')
  const [packageTotal, setPackageTotal] = useState('')
  const [note, setNote] = useState('')
  const [rowsForm, setRowsForm] = useState([])
  const [courseToAdd, setCourseToAdd] = useState('')
  const [courseToAddQuota, setCourseToAddQuota] = useState('')

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-overview', { month, search }],
    queryFn: () => fetchAllieviPaymentsMonth({ month, search, courseId: 'all', status: 'all' }),
  })

  const detailsQuery = useQuery({
    queryKey: ['nova-package-details', selected?.tesseramento_id],
    queryFn: () => fetchStudentPackageDetails(selected.tesseramento_id),
    enabled: !!selected?.tesseramento_id,
  })

  const coursesQuery = useQuery({
    queryKey: ['nova-package-courses-list'],
    queryFn: fetchOrchideaCourses,
    enabled: !!selected,
  })

  const teachersQuery = useQuery({
    queryKey: ['nova-package-teacher-rules'],
    queryFn: () => fetchOrchideaTeachers({ search: '' }),
    enabled: !!selected,
  })

  const saveMutation = useMutation({
    mutationFn: saveStudentPackage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-packages-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      queryClient.invalidateQueries({ queryKey: ['atleta-details-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
      queryClient.invalidateQueries({ queryKey: ['nova-package-details'] })
    },
  })

  const addCourseMutation = useMutation({
    mutationFn: addCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-package-details'] })
      queryClient.invalidateQueries({ queryKey: ['nova-packages-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      setCourseToAdd('')
      setCourseToAddQuota('')
    },
  })

  const removeCourseMutation = useMutation({
    mutationFn: removeCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-package-details'] })
      queryClient.invalidateQueries({ queryKey: ['nova-packages-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
    },
  })

  const packages = packagesQuery.data || []
  const details = detailsQuery.data || { enrollments: [] }
  const allCourses = coursesQuery.data || []
  const teachers = teachersQuery.data || []

  useEffect(() => {
    if (!selected) {
      setRowsForm([])
      return
    }

    if (!details.enrollments?.length) {
      setRowsForm([])
      setPackageName('Pacchetto mensile')
      setPackageTotal('')
      setNote('')
      return
    }

    const first = details.enrollments[0]
    const prepared = details.enrollments.map(prepareEnrollment)
    const calculatedTotal = prepared.reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)

    setPackageName(first.pacchetto_nome || (details.enrollments.length > 1 ? 'Pacchetto multicorso' : 'Corso singolo'))
    setPackageTotal(first.pacchetto_totale_mensile ? Number(first.pacchetto_totale_mensile).toFixed(2) : (calculatedTotal ? calculatedTotal.toFixed(2) : ''))
    setNote(first.note_pacchetto || '')
    setRowsForm(prepared)
  }, [selected, details.enrollments])

  const summary = useMemo(() => {
    return packages.reduce((acc, row) => {
      acc.students += 1
      acc.courses += row.corsi?.length || 0
      acc.monthly += numeric(row.quota_mese)
      return acc
    }, { students: 0, courses: 0, monthly: 0 })
  }, [packages])

  const assignedCourseIds = new Set(rowsForm.map((row) => String(row.corso_id)))
  const availableCourses = allCourses.filter((course) => !assignedCourseIds.has(String(course.id)))
  const selectedCourseToAdd = allCourses.find((course) => String(course.id) === String(courseToAdd))
  const packageEditorTotal = rowsForm.reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)
  const teacherEditorTotal = rowsForm.reduce((sum, row) => sum + numeric(row.quota_insegnante_mensile), 0)
  const originalCoursesTotal = rowsForm.reduce((sum, row) => sum + numeric(row.prezzo_corso), 0)

  function updateRow(index, field, value) {
    setRowsForm((prev) => prev.map((row, idx) => {
      if (idx !== index) return row
      const safeValue = field === 'quota_allievo_mensile' || field === 'quota_insegnante_mensile' || field === 'percentuale_insegnante' ? String(Math.max(0, numeric(value))) : value
      const updated = { ...row, [field]: safeValue }
      if (field === 'quota_allievo_mensile' && updated.percentuale_insegnante !== '' && updated.percentuale_insegnante !== null && updated.percentuale_insegnante !== undefined) {
        updated.quota_insegnante_mensile = (numeric(value) * numeric(updated.percentuale_insegnante) / 100).toFixed(2)
      }
      return updated
    }))
  }

  function distributePackage() {
    const total = numeric(packageTotal || originalCoursesTotal)
    if (!rowsForm.length) return

    if (!total || total <= 0) {
      setRowsForm((prev) => prev.map((row) => ({
        ...row,
        quota_allievo_mensile: '0.00',
        quota_insegnante_mensile: row.percentuale_insegnante ? '0.00' : row.quota_insegnante_mensile,
      })))
      return
    }

    setRowsForm((prev) => {
      const weights = prev.map((row) => Math.max(numeric(row.prezzo_corso), 0))
      const weightTotal = weights.reduce((sum, value) => sum + value, 0)
      const safeWeights = weightTotal > 0 ? weights : prev.map(() => 1)
      const safeTotal = weightTotal > 0 ? weightTotal : prev.length

      const rawShares = prev.map((_, idx) => total * safeWeights[idx] / safeTotal)
      const rounded = rawShares.map((value) => Math.max(0, Math.floor(value * 100) / 100))
      let centsToAssign = Math.round(total * 100) - rounded.reduce((sum, value) => sum + Math.round(value * 100), 0)

      const order = rawShares
        .map((value, idx) => ({ idx, fraction: value - Math.floor(value * 100) / 100 }))
        .sort((a, b) => b.fraction - a.fraction)

      let pointer = 0
      while (centsToAssign > 0 && order.length) {
        rounded[order[pointer % order.length].idx] = roundMoney(rounded[order[pointer % order.length].idx] + 0.01)
        centsToAssign -= 1
        pointer += 1
      }

      return prev.map((row, idx) => {
        const value = Math.max(0, rounded[idx])
        const updated = { ...row, quota_allievo_mensile: value.toFixed(2) }
        if (updated.percentuale_insegnante !== '' && updated.percentuale_insegnante !== null && updated.percentuale_insegnante !== undefined) {
          updated.quota_insegnante_mensile = (value * numeric(updated.percentuale_insegnante) / 100).toFixed(2)
        }
        return updated
      })
    })
  }

  function applyTeacherRules() {
    setRowsForm((prev) => prev.map((row) => applyTeacherRuleToRow(row, teachers)))
  }

  function applyTeacherPercent(percent) {
    setRowsForm((prev) => prev.map((row) => ({
      ...row,
      percentuale_insegnante: String(percent),
      quota_insegnante_mensile: (numeric(row.quota_allievo_mensile) * percent / 100).toFixed(2),
    })))
  }

  function addCourse(e) {
    e.preventDefault()
    if (!selected?.tesseramento_id || !courseToAdd) return
    const quota = courseToAddQuota === '' ? selectedCourseToAdd?.prezzo_mensile : Math.max(0, numeric(courseToAddQuota))
    addCourseMutation.mutate({
      courseId: courseToAdd,
      studentId: selected.tesseramento_id,
      tariffaMensile: quota,
    })
  }

  function submit(e) {
    e.preventDefault()
    if (!selected?.tesseramento_id) return
    saveMutation.mutate({
      studentId: selected.tesseramento_id,
      packageName,
      packageTotal: packageTotal || packageEditorTotal,
      note,
      rows: rowsForm,
    })
  }

  return (
    <section className="page packages-page">
      <div className="dashboard-hero packages-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Pacchetti allievi</div>
          <h2 className="dashboard-hero__title">Pacchetti, quote corso e compensi insegnanti</h2>
          <p className="dashboard-hero__text">Imposta il totale mensile corretto, dividi la quota tra i corsi in proporzione al prezzo originale e assegna il compenso spettante a ogni insegnante.</p>
        </div>
      </div>

      <div className="packages-summary-grid">
        <div className="page-card packages-summary-card"><UserRoundCheck /><span>Allievi con corsi</span><strong>{summary.students}</strong></div>
        <div className="page-card packages-summary-card"><PackageCheck /><span>Corsi collegati</span><strong>{summary.courses}</strong></div>
        <div className="page-card packages-summary-card"><Euro /><span>Quote mensili</span><strong>{euro(summary.monthly)}</strong></div>
      </div>

      <div className="page-card packages-toolbar">
        <label>Mese
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="packages-search"><Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca allievo, email, CF, tessera…" />
        </label>
      </div>

      {packagesQuery.isLoading ? <div className="page-card">Caricamento pacchetti…</div> : null}
      {packagesQuery.error ? <p className="form-error">Errore: {packagesQuery.error.message}</p> : null}

      <div className="packages-list">
        {packages.map((row) => (
          <article className="page-card package-row-card" key={row.tesseramento_id}>
            <div className="package-row-main">
              <span className="package-avatar">{initials(row)}</span>
              <div>
                <h3>{row.nomeCompleto}</h3>
                <p>{row.numero_tessera || row.email || 'Senza tessera'} · {row.corsi?.length || 0} corsi</p>
                <div className="package-course-chips">
                  {(row.corsi || []).map((course) => <span key={`${row.tesseramento_id}-${course.id}`}>{course.nome}</span>)}
                </div>
              </div>
            </div>
            <div className="package-row-price">
              <small>Quota {monthLabel(month)}</small>
              <strong>{euro(row.quota_mese)}</strong>
              <button className="topbar__button topbar__button--primary" type="button" onClick={() => setSelected(row)}>Modifica pacchetto</button>
            </div>
          </article>
        ))}
        {!packagesQuery.isLoading && !packagesQuery.error && packages.length === 0 ? <div className="page-card packages-empty">Nessun pacchetto trovato.</div> : null}
      </div>

      {selected ? (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalCard package-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="package-editor-hero">
              <div>
                <div className="dashboard-hero__eyebrow">Modifica pacchetto</div>
                <h3>{selected.nomeCompleto}</h3>
                <p>Aggiungi o rimuovi corsi, poi distribuisci il totale in proporzione al prezzo originale dei corsi.</p>
              </div>
              <button className="student-profile-close" onClick={() => setSelected(null)}>Chiudi</button>
            </div>

            <form className="package-editor-body" onSubmit={submit}>
              <div className="package-editor-settings">
                <label>Nome pacchetto
                  <input value={packageName} onChange={(e) => setPackageName(e.target.value)} />
                </label>
                <label>Totale pacchetto mensile
                  <input type="number" step="0.01" value={packageTotal} onChange={(e) => setPackageTotal(e.target.value)} placeholder="Es. 100" />
                </label>
                <label>Note interne
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. promo, sconto fratelli…" />
                </label>
              </div>

              <div className="package-add-course-card">
                <div>
                  <div className="dashboard-hero__eyebrow">Corsi nel pacchetto</div>
                  <h4>Aggiungi un corso all’allievo</h4>
                  <p>Puoi inserire una quota iniziale oppure lasciare il prezzo originale del corso.</p>
                </div>
                <div className="package-add-course-form">
                  <select value={courseToAdd} onChange={(e) => setCourseToAdd(e.target.value)}>
                    <option value="">Seleziona corso da aggiungere</option>
                    {availableCourses.map((course) => (
                      <option value={course.id} key={course.id}>{course.nome}{course.livello ? ` · ${course.livello}` : ''} · {euro(course.prezzo_mensile)}</option>
                    ))}
                  </select>
                  <input type="number" step="0.01" value={courseToAddQuota} onChange={(e) => setCourseToAddQuota(e.target.value)} placeholder={selectedCourseToAdd?.prezzo_mensile ? `Quota ${euro(selectedCourseToAdd.prezzo_mensile)}` : 'Quota iniziale'} />
                  <button type="button" className="topbar__button topbar__button--primary" disabled={!courseToAdd || addCourseMutation.isPending} onClick={addCourse}>
                    <Plus size={16} /> {addCourseMutation.isPending ? 'Aggiungo…' : 'Aggiungi corso'}
                  </button>
                </div>
              </div>

              <div className="package-editor-actions">
                <button type="button" className="topbar__button" onClick={distributePackage}><Calculator size={16} /> Distribuisci per prezzo originale</button>
                <button type="button" className="topbar__button" onClick={applyTeacherRules}><Euro size={16} /> Applica regole insegnanti</button>
                <button type="button" className="topbar__button" onClick={() => applyTeacherPercent(50)}><Percent size={16} /> 50% insegnante</button>
                <button type="button" className="topbar__button" onClick={() => applyTeacherPercent(40)}><Percent size={16} /> 40% insegnante</button>
              </div>

              <div className="package-editor-totals">
                <span><strong>{euro(packageEditorTotal)}</strong><small>Totale quota allievo</small></span>
                <span><strong>{euro(teacherEditorTotal)}</strong><small>Totale compensi insegnanti</small></span>
                <span><strong>{euro(originalCoursesTotal)}</strong><small>Somma prezzi originali</small></span>
                <span><strong>{rowsForm.length}</strong><small>Corsi nel pacchetto</small></span>
              </div>

              {detailsQuery.isLoading ? <p>Caricamento corsi collegati…</p> : null}
              {detailsQuery.error ? <p className="form-error">Errore corsi collegati: {detailsQuery.error.message}</p> : null}
              {coursesQuery.error ? <p className="form-error">Errore lista corsi: {coursesQuery.error.message}</p> : null}
              {addCourseMutation.error ? <p className="form-error">Errore aggiunta corso: {addCourseMutation.error.message}</p> : null}
              {removeCourseMutation.error ? <p className="form-error">Errore rimozione corso: {removeCourseMutation.error.message}</p> : null}

              <div className="package-course-editor-list">
                {rowsForm.map((row, index) => (
                  <div className="package-course-editor-row" key={row.id}>
                    <div className="package-course-editor-title">
                      <Sparkles size={18} />
                      <div>
                        <strong>{row.nome}</strong>
                        <small>{row.livello || 'Livello non impostato'} · {row.insegnante || 'Senza insegnante'} · prezzo originale {euro(row.prezzo_corso)}</small>
                        <small className="package-teacher-rule">Metodo insegnante: {row.teacher_payment_type === 'fisso' ? 'quota fissa' : row.teacher_payment_type === 'percentuale' ? 'percentuale' : row.teacher_payment_type === 'manuale' ? 'manuale' : 'non impostato'}</small>
                      </div>
                    </div>
                    <label>Quota allievo
                      <input type="number" step="0.01" value={row.quota_allievo_mensile} onChange={(e) => updateRow(index, 'quota_allievo_mensile', e.target.value)} />
                    </label>
                    <label>Compenso insegnante
                      <input type="number" step="0.01" value={row.quota_insegnante_mensile} onChange={(e) => updateRow(index, 'quota_insegnante_mensile', e.target.value)} />
                    </label>
                    <label>% insegnante
                      <input type="number" step="0.01" value={row.percentuale_insegnante} onChange={(e) => {
                        const percent = e.target.value
                        setRowsForm((prev) => prev.map((item, idx) => idx === index ? {
                          ...item,
                          percentuale_insegnante: percent,
                          teacher_payment_type: percent === '' ? item.teacher_payment_type : 'percentuale',
                          quota_insegnante_mensile: percent === '' ? '' : (numeric(item.quota_allievo_mensile) * numeric(percent) / 100).toFixed(2),
                        } : item))
                      }} />
                    </label>
                    <button type="button" className="payments-icon-btn danger package-remove-course-btn" disabled={removeCourseMutation.isPending} onClick={() => removeCourseMutation.mutate(row.id)} title="Rimuovi corso dal pacchetto">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {!detailsQuery.isLoading && rowsForm.length === 0 ? (
                <div className="package-empty-courses">
                  <BookOpenCheck size={28} />
                  <strong>Nessun corso collegato</strong>
                  <p>Aggiungi un corso dal box sopra per creare il pacchetto dell’allievo.</p>
                </div>
              ) : null}

              {saveMutation.error ? <p className="form-error">{saveMutation.error.message}</p> : null}
              {saveMutation.isSuccess ? <p className="success-text">Pacchetto aggiornato correttamente.</p> : null}

              <div className="modalActions">
                <button type="button" className="topbar__button" onClick={() => setSelected(null)}>Annulla</button>
                <button className="topbar__button topbar__button--primary" disabled={saveMutation.isPending}><Save size={16} /> {saveMutation.isPending ? 'Salvo…' : 'Salva pacchetto'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
