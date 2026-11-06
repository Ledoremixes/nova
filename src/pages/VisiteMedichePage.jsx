import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronDown, FileDown, FileText, HeartPulse, Plus, Search, Trash2, Upload, UserRoundSearch, X } from 'lucide-react'
import { createMedicalVisit, deleteMedicalVisit, fetchMedicalActiveStudents, fetchMedicalStudents, fetchMedicalVisits } from '../api/medicalVisits'
import { exportMissingMedicalVisitsPdf, getMissingMedicalStudents } from '../lib/medicalVisitsReport'
import '../styles/VisiteMedichePage.css'
import { useAuth } from '../context/authContext'
import { annualMedicalExpiry } from '../utils/medicalExpiry'

const emptyForm = { tesseramento_id: '', issued_at: '', expires_at: '', doctor: '', notes: '', status: 'valida' }

function statusOf(row) {
  // Un record senza documento allegato non certifica che la visita sia stata consegnata.
  if (row.is_missing || !String(row.file_path || '').trim()) {
    return { label: 'Non presente', cls: 'nova-pill nova-pill--warn' }
  }
  if (row.status === 'da_verificare' || !row.expires_at) {
    return { label: 'Da verificare', cls: 'nova-pill nova-pill--neutral' }
  }
  const diff = dayjs(row.expires_at).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff < 0) return { label: 'Scaduta', cls: 'nova-pill nova-pill--warn' }
  if (diff <= 30) return { label: 'In scadenza', cls: 'nova-pill nova-pill--warn' }
  return { label: 'Valida', cls: 'nova-pill nova-pill--ok' }
}

function studentSecondary(student) {
  return student?.email || student?.telefono || 'Nessun contatto'
}

export default function VisiteMedichePage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [exportFeedback, setExportFeedback] = useState('')
  const currentMonth = dayjs().format('YYYY-MM')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false)

  const studentsQuery = useQuery({ queryKey: ['medical-students'], queryFn: fetchMedicalStudents })
  const activeStudentsQuery = useQuery({
    queryKey: ['medical-active-students', currentMonth],
    queryFn: () => fetchMedicalActiveStudents(currentMonth),
    staleTime: 60_000,
  })
  const visitsQuery = useQuery({ queryKey: ['medical-visits'], queryFn: fetchMedicalVisits })

  const activeStudents = useMemo(() => activeStudentsQuery.data || [], [activeStudentsQuery.data])
  const students = useMemo(() => {
    const byId = new Map()
    for (const student of [...(studentsQuery.data || []), ...activeStudents]) {
      byId.set(String(student.id), student)
    }
    return [...byId.values()]
  }, [studentsQuery.data, activeStudents])
  const selectedStudent = useMemo(() => students.find((item) => item.id === form.tesseramento_id) || null, [students, form.tesseramento_id])
  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase()
    if (!term) return students.slice(0, 12)
    return students
      .filter((student) => [student.nomeCompleto, student.email, student.telefono].some((value) => String(value || '').toLowerCase().includes(term)))
      .slice(0, 20)
  }, [students, studentSearch])

  function resetModal() {
    setOpen(false)
    setForm(emptyForm)
    setFile(null)
    setStudentSearch('')
    setStudentDropdownOpen(false)
  }

  function handleSelectStudent(student) {
    setForm((current) => ({ ...current, tesseramento_id: student.id }))
    setStudentSearch(student.nomeCompleto)
    setStudentDropdownOpen(false)
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const student = students.find((item) => item.id === form.tesseramento_id)
      if (!student) throw new Error('Seleziona un corsista.')
      return createMedicalVisit({ student, payload: form, file })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-visits'] })
      resetModal()
    },
  })
  const deleteMutation = useMutation({ mutationFn: deleteMedicalVisit, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medical-visits'] }) })

  const visits = useMemo(() => visitsQuery.data || [], [visitsQuery.data])
  const missingStudents = useMemo(
    () => getMissingMedicalStudents(activeStudents, visits),
    [activeStudents, visits],
  )
  const missingVisits = useMemo(() => missingStudents.map((student) => ({
    id: 'missing:' + student.id,
    tesseramento_id: student.id,
    student_name: student.nomeCompleto,
    student_email: student.email || '',
    student_phone: student.telefono || '',
    student_courses: student.corsi || [],
    file_path: null,
    is_missing: true,
  })), [missingStudents])
  const filtered = useMemo(() => {
    const source = statusFilter === 'non_presente'
      ? missingVisits
      : statusFilter === 'all'
        ? visits
        : visits.filter((row) => {
          const state = statusOf(row).label
          return state === statusFilter
        })
    const term = search.trim().toLowerCase()
    if (!term) return source
    return source.filter((row) => [
      row.student_name, row.student_email, row.student_phone,
      ...(row.student_courses || []), row.doctor, row.notes,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [visits, missingVisits, search, statusFilter])

  const canExport = isAdmin && !visitsQuery.isFetching && !activeStudentsQuery.isFetching
    && !visitsQuery.error && !activeStudentsQuery.error && missingStudents.length > 0

  function downloadMissingPdf() {
    if (!canExport) return
    try {
      const count = exportMissingMedicalVisitsPdf({ students: missingStudents, month: currentMonth })
      setExportFeedback('PDF generato: ' + count + ' corsisti senza certificato caricato.')
    } catch (error) {
      setExportFeedback('Errore generazione PDF: ' + (error.message || 'riprova'))
    }
  }

  function openVisitForStudent(studentId) {
    const student = students.find((row) => String(row.id) === String(studentId))
    if (!student) return
    setForm({ ...emptyForm, tesseramento_id: student.id })
    setStudentSearch(student.nomeCompleto)
    setStudentDropdownOpen(false)
    setFile(null)
    setOpen(true)
  }

  return (
    <section className="page visits-page">
      <div className="dashboard-hero medical-visits-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Salute e documenti</div>
          <h2 className="dashboard-hero__title">Visite mediche</h2>
          <p className="dashboard-hero__text">Controlla i certificati dei corsisti con iscrizione attiva, individua quelli non presenti e prepara i solleciti.</p>
        </div>
        {isAdmin ? (
          <div className="medical-visits-hero-actions">
            <button type="button" className="topbar__button" disabled={!canExport} onClick={downloadMissingPdf}>
              <FileDown size={16} /> PDF non presenti ({activeStudentsQuery.isLoading || visitsQuery.isLoading ? '…' : missingStudents.length})
            </button>
            <button type="button" className="topbar__button topbar__button--primary" onClick={() => setOpen(true)}>
              <Plus size={16} /> Nuova visita
            </button>
          </div>
        ) : null}
      </div>
      <div className="stats-grid">
        <div className="page-card tesserati-stat-card"><span>Visite registrate</span><strong>{visits.length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>In scadenza / scadute</span><strong>{visits.filter((v) => ['In scadenza', 'Scaduta'].includes(statusOf(v).label)).length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Non presenti · corsisti attivi</span><strong>{activeStudentsQuery.isLoading || visitsQuery.isLoading ? '…' : activeStudentsQuery.error || visitsQuery.error ? '—' : missingStudents.length}</strong></div>
      </div>
      <div className="page-card">
        <div className="toolbar medical-visits-toolbar">
          <div className="searchWrapper">
            <Search size={18} />
            <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome, email, telefono o corso…" />
          </div>
          <label className="medical-visits-status-filter">
            <span>Stato visita</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Tutte le visite</option>
              <option value="non_presente">Non presente</option>
              <option value="Valida">Valida</option>
              <option value="In scadenza">In scadenza</option>
              <option value="Scaduta">Scaduta</option>
              <option value="Da verificare">Da verificare</option>
            </select>
          </label>
        </div>
        {statusFilter === 'non_presente' ? (
          <p className="medical-visits-filter-hint">
            Corsisti con iscrizioni attive a {dayjs(currentMonth + '-01').format('MMMM YYYY')} e senza certificato allegato.
            Le visite scadute sono consultabili con il filtro dedicato.
          </p>
        ) : null}
        {exportFeedback ? <p className="medical-visits-feedback" role="status">{exportFeedback}</p> : null}
        {studentsQuery.error ? <p className="form-error">{studentsQuery.error.message}</p> : null}
        {activeStudentsQuery.error ? <p className="form-error">Non posso calcolare i certificati mancanti: {activeStudentsQuery.error.message}</p> : null}
        {visitsQuery.error ? <p className="form-error">{visitsQuery.error.message}</p> : null}
        {statusFilter === 'non_presente' && (activeStudentsQuery.isLoading || visitsQuery.isLoading) ? (
          <p className="medical-visits-filter-hint">Verifica completa dei corsisti in corso…</p>
        ) : null}
        <div className="tableWrap">
          <table className="dataTable medical-visits-table">
            <thead><tr>
              <th>Corsista</th><th>Rilascio</th><th>Scadenza</th><th>Stato</th><th>Documento</th><th>Azioni</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6">{visitsQuery.isLoading || (statusFilter === 'non_presente' && activeStudentsQuery.isLoading)
                  ? 'Caricamento delle visite…'
                  : visitsQuery.error || (statusFilter === 'non_presente' && activeStudentsQuery.error)
                    ? 'Impossibile verificare i dati al momento.'
                    : statusFilter === 'non_presente' ? 'Nessun corsista senza certificato trovato.' : 'Nessuna visita medica trovata.'}</td></tr>
              ) : filtered.map((row) => {
                const st = statusOf(row)
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.student_name}</strong>
                      <span className="medical-visits-secondary">{row.student_email || row.student_phone || '—'}</span>
                      {row.is_missing && row.student_courses?.length ? (
                        <span className="medical-visits-courses">{row.student_courses.join(', ')}</span>
                      ) : null}
                    </td>
                    <td>{row.issued_at ? dayjs(row.issued_at).format('DD/MM/YYYY') : '—'}</td>
                    <td>{row.expires_at ? dayjs(row.expires_at).format('DD/MM/YYYY') : '—'}</td>
                    <td><span className={st.cls}>{st.label}</span></td>
                    <td>{row.file_signed_url ? (
                      <a className="actionBtn" href={row.file_signed_url} target="_blank" rel="noreferrer">Apri file</a>
                    ) : '—'}</td>
                    <td>
                      {row.is_missing ? (
                        isAdmin ? <button type="button" className="actionBtn" onClick={() => openVisitForStudent(row.tesseramento_id)}><Plus size={15} /> Carica visita</button> : '—'
                      ) : isAdmin ? (
                        <button type="button" className="actionBtn actionBtn--danger" onClick={() => deleteMutation.mutate(row.id)}>
                          <Trash2 size={15} /> Elimina
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modalOverlay" onClick={resetModal}>
          <div className="modalCard medical-visit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="medical-visit-modal__header">
              <div className="medical-visit-modal__header-main">
                <div className="medical-visit-modal__icon"><HeartPulse size={22} /></div>
                <div>
                  <h3>Nuova visita medica</h3>
                  <p>Ricerca rapida del corsista, dati della visita e caricamento foto/PDF.</p>
                </div>
              </div>
              <button type="button" className="medical-visit-modal__close" onClick={resetModal} aria-label="Chiudi finestra">
                <X size={18} />
              </button>
            </div>

            <form className="formGrid medical-visit-form" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}>
              <label className="formFull medical-student-field">
                <span className="medical-field__label">Corsista</span>
                <div className="medical-student-picker">
                  <div className="medical-student-picker__inputWrap">
                    <UserRoundSearch size={18} />
                    <input
                      value={studentSearch}
                      onChange={(e) => {
                        setStudentSearch(e.target.value)
                        setStudentDropdownOpen(true)
                        setForm((current) => ({ ...current, tesseramento_id: '' }))
                      }}
                      onFocus={() => setStudentDropdownOpen(true)}
                      placeholder="Cerca per nome, cognome, email o telefono"
                      autoComplete="off"
                      required={!form.tesseramento_id}
                    />
                    <button type="button" className="medical-student-picker__toggle" onClick={() => setStudentDropdownOpen((value) => !value)} aria-label="Apri elenco corsisti">
                      <ChevronDown size={18} />
                    </button>
                  </div>
                  {selectedStudent ? (
                    <div className="medical-selected-student">
                      <CheckCircle2 size={16} />
                      <div>
                        <strong>{selectedStudent.nomeCompleto}</strong>
                        <span>{studentSecondary(selectedStudent)}</span>
                      </div>
                      <button
                        type="button"
                        className="medical-selected-student__clear"
                        onClick={() => {
                          setForm((current) => ({ ...current, tesseramento_id: '' }))
                          setStudentSearch('')
                          setStudentDropdownOpen(true)
                        }}
                      >
                        Cambia
                      </button>
                    </div>
                  ) : null}
                  {studentDropdownOpen ? (
                    <div className="medical-student-picker__menu">
                      {studentsQuery.isLoading ? <div className="medical-student-picker__empty">Caricamento corsisti…</div> : null}
                      {!studentsQuery.isLoading && filteredStudents.length === 0 ? <div className="medical-student-picker__empty">Nessun corsista trovato.</div> : null}
                      {!studentsQuery.isLoading && filteredStudents.map((student) => (
                        <button key={student.id} type="button" className={`medical-student-picker__option ${student.id === form.tesseramento_id ? 'is-active' : ''}`} onClick={() => handleSelectStudent(student)}>
                          <strong>{student.nomeCompleto}</strong>
                          <span>{studentSecondary(student)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <small className="medical-field__hint">Digita il nome e dal menu compariranno solo i corsisti coerenti con la ricerca.</small>
              </label>

              <label>
                <span className="medical-field__label">Data rilascio</span>
                <div className="medical-inputWrap">
                  <CalendarDays size={18} />
                  <input type="date" value={form.issued_at} onChange={(e) => setForm((current) => ({ ...current, issued_at: e.target.value, expires_at: annualMedicalExpiry(e.target.value) }))} />
                </div>
              </label>

              <label>
                <span className="medical-field__label">Scadenza (calcolata automaticamente, modificabile)</span>
                <div className="medical-inputWrap">
                  <CalendarDays size={18} />
                  <input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
                </div>
              </label>

              <label>
                <span className="medical-field__label">Medico / centro</span>
                <input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} placeholder="Es. Centro medico Saronno" />
              </label>

              <label className="formFull">
                <span className="medical-field__label">Stato visita</span>
                <div className="medical-status-grid">
                  <button type="button" className={`medical-status-card ${form.status === 'valida' ? 'is-active is-valid' : ''}`} onClick={() => setForm({ ...form, status: 'valida' })}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>Valida</strong>
                      <span>Documento regolare e verificato.</span>
                    </div>
                  </button>
                  <button type="button" className={`medical-status-card ${form.status === 'da_verificare' ? 'is-active is-neutral' : ''}`} onClick={() => setForm({ ...form, status: 'da_verificare' })}>
                    <HeartPulse size={18} />
                    <div>
                      <strong>Da verificare</strong>
                      <span>Usa questo flag se manca una verifica finale.</span>
                    </div>
                  </button>
                </div>
              </label>

              <label className="formFull">
                <span className="medical-field__label">Note</span>
                <textarea className="formTextarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Eventuali note interne sulla visita" />
              </label>

              <label className="formFull">
                <span className="medical-field__label">Foto / PDF visita</span>
                <div className="medical-file-field">
                  <label className="medical-file-field__button">
                    <Upload size={18} />
                    <span>Scegli file</span>
                    <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  <div className="medical-file-field__meta">
                    <FileText size={16} />
                    <span>{file?.name || 'Nessun file selezionato'}</span>
                  </div>
                </div>
              </label>

              {createMutation.error ? <p className="form-error formFull">{createMutation.error.message}</p> : null}
              <div className="modalActions medical-visit-modal__actions"><button type="button" className="topbar__button" onClick={resetModal}>Annulla</button><button className="topbar__button topbar__button--primary" disabled={createMutation.isPending || !form.tesseramento_id}>{createMutation.isPending ? 'Salvataggio…' : 'Salva visita'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
