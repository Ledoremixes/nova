import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { useAuth } from '../context/authContext'
import {
  addCourseParticipant,
  createOrchideaCourse,
  deleteOrchideaCourse,
  fetchCourseParticipants,
  fetchOrchideaCourses,
  fetchOrchideaStudents,
  removeCourseParticipant,
  updateOrchideaCourse,
} from '../api/orchideaEntities'
import '../styles/GruppiPage.css'

const emptyForm = {
  nome: '',
  disciplina: '',
  livello: '',
  giorno_settimana: '',
  ora_inizio: '',
  ora_fine: '',
  prezzo_mensile: '',
  sala: '',
  insegnante: '',
  descrizione: '',
  colore: '#6d5dfc',
  attivo: true,
}

const weekDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function time(value) {
  return value ? String(value).slice(0, 5) : '—'
}

export default function GruppiPage() {
  const { role } = useAuth()
  const currentRole = String(role || '').trim().toLowerCase()
  const isAdmin = currentRole === 'admin'
  const canManageCourses = isAdmin || currentRole === 'user'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [participantSearch, setParticipantSearch] = useState('')
  const [studentToAdd, setStudentToAdd] = useState('')
  const [studentPickerSearch, setStudentPickerSearch] = useState('')
  const [courseToDelete, setCourseToDelete] = useState(null)

  const coursesQuery = useQuery({
    queryKey: ['orchidea-corsi'],
    queryFn: fetchOrchideaCourses,
  })

  const participantsQuery = useQuery({
    queryKey: ['orchidea-corso-partecipanti', selectedCourse?.id],
    queryFn: () => fetchCourseParticipants(selectedCourse.id),
    enabled: Boolean(selectedCourse?.id),
  })

  const studentsQuery = useQuery({
    queryKey: ['orchidea-students-for-course-picker'],
    queryFn: () => fetchOrchideaStudents(),
    enabled: Boolean(selectedCourse?.id),
  })

  function closeCourseEditor() {
    setEditing(null)
    setCreating(false)
    setForm(emptyForm)
    setFormError('')
    createMutation.reset()
    updateMutation.reset()
  }

  const createMutation = useMutation({
    mutationFn: createOrchideaCourse,
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
      setNotice(`Corso “${course?.nome || form.nome}” creato correttamente.`)
      closeCourseEditor()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateOrchideaCourse(id, payload),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
      setNotice(`Corso “${course?.nome || form.nome}” aggiornato correttamente.`)
      closeCourseEditor()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (courseId) => deleteOrchideaCourse(courseId),
    onSuccess: (_, courseId) => {
      const deletedName = courseToDelete?.nome || 'Corso'
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
      queryClient.removeQueries({ queryKey: ['orchidea-corso-partecipanti', courseId] })
      if (selectedCourse?.id === courseId) setSelectedCourse(null)
      if (editing?.id === courseId) closeCourseEditor()
      setCourseToDelete(null)
      setNotice(`Corso “${deletedName}” eliminato correttamente.`)
    },
  })

  const addParticipantMutation = useMutation({
    mutationFn: ({ courseId, studentId, tariffaMensile }) => addCourseParticipant({ courseId, studentId, tariffaMensile }),
    onSuccess: () => {
      setStudentToAdd('')
      setStudentPickerSearch('')
      queryClient.invalidateQueries({ queryKey: ['orchidea-corso-partecipanti', selectedCourse?.id] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
    },
  })

  const removeParticipantMutation = useMutation({
    mutationFn: removeCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-corso-partecipanti', selectedCourse?.id] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
    },
  })

  const courses = useMemo(() => coursesQuery.data || [], [coursesQuery.data])
  const filteredCourses = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return courses
    return courses.filter((course) => [
      course.nome,
      course.disciplina,
      course.livello,
      course.giorno_settimana,
      course.insegnante,
      course.sala,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [courses, search])

  const participants = useMemo(() => participantsQuery.data || [], [participantsQuery.data])
  const filteredParticipants = useMemo(() => {
    const term = participantSearch.trim().toLowerCase()
    if (!term) return participants
    return participants.filter((row) => [
      row.student?.nome,
      row.student?.cognome,
      row.student?.email,
      row.student?.telefono,
      row.student?.cf,
      row.student?.numero_tessera,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [participants, participantSearch])

  const availableStudents = useMemo(() => {
    const alreadyEnrolled = new Set(participants.map((row) => row.tesseramento_id).filter(Boolean))
    const term = studentPickerSearch.trim().toLowerCase()
    return (studentsQuery.data || [])
      .filter((student) => !alreadyEnrolled.has(student.id))
      .filter((student) => {
        if (!term) return true
        return [
          student.nome,
          student.cognome,
          student.email,
          student.telefono,
          student.cf,
          student.numero_tessera,
        ].some((value) => String(value || '').toLowerCase().includes(term))
      })
      .slice(0, 80)
  }, [studentsQuery.data, participants, studentPickerSearch])

  function openCreate() {
    if (!canManageCourses) return
    setNotice('')
    setEditing(null)
    setCreating(true)
    setForm({ ...emptyForm })
    setFormError('')
    createMutation.reset()
    updateMutation.reset()
  }

  function openEdit(course) {
    setNotice('')
    setCreating(false)
    setEditing(course)
    setFormError('')
    createMutation.reset()
    updateMutation.reset()
    setForm({
      nome: course.nome || '',
      disciplina: course.disciplina || '',
      livello: course.livello || '',
      giorno_settimana: course.giorno_settimana || '',
      ora_inizio: time(course.ora_inizio) === '—' ? '' : time(course.ora_inizio),
      ora_fine: time(course.ora_fine) === '—' ? '' : time(course.ora_fine),
      prezzo_mensile: course.prezzo_mensile ?? '',
      sala: course.sala || '',
      insegnante: course.insegnante || '',
      descrizione: course.descrizione || '',
      colore: course.colore || '#6d5dfc',
      attivo: course.attivo !== false,
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canManageCourses) return

    const nome = form.nome.trim()
    const numericPrice = form.prezzo_mensile === '' ? null : Number(form.prezzo_mensile)

    if (!nome) {
      setFormError('Inserisci il nome del corso.')
      return
    }

    if (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0)) {
      setFormError('Il prezzo mensile deve essere un valore valido e non negativo.')
      return
    }

    setFormError('')
    const payload = {
      ...form,
      nome,
      prezzo_mensile: numericPrice === null ? '' : numericPrice,
    }

    if (editing?.id) {
      updateMutation.mutate({ id: editing.id, payload })
      return
    }

    if (creating) createMutation.mutate(payload)
  }

  function handleAddParticipant(e) {
    e.preventDefault()
    if (!selectedCourse?.id || !studentToAdd || !canManageCourses) return
    addParticipantMutation.mutate({
      courseId: selectedCourse.id,
      studentId: studentToAdd,
      tariffaMensile: selectedCourse.prezzo_mensile,
    })
  }

  const editorOpen = creating || Boolean(editing)
  const savingCourse = createMutation.isPending || updateMutation.isPending
  const courseMutationError = createMutation.error || updateMutation.error

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Corsi Orchidea</div>
          <h2 className="dashboard-hero__title">Corsi e partecipanti</h2>
          <p className="dashboard-hero__text">Crea e gestisci i corsi del portale allievi, controlla i partecipanti iscritti e aggiorna prezzi, orari e stato.</p>
        </div>
      </div>

      {notice ? (
        <div className="course-notice" role="status" aria-live="polite">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Chiudi messaggio"><X size={16} /></button>
        </div>
      ) : null}

      <div className="page-card">
        <div className="section-head course-section-head">
          <div>
            <h2>Corsi</h2>
            <p>{filteredCourses.length} corsi trovati.</p>
          </div>
          {canManageCourses ? (
            <button className="topbar__button topbar__button--primary course-create-button" type="button" onClick={openCreate}>
              <Plus size={17} /> Nuovo corso
            </button>
          ) : null}
        </div>

        <div className="toolbar">
          <div className="searchWrapper">
            <Search size={18} />
            <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca corso, livello, insegnante, giorno…" />
          </div>
        </div>

        {coursesQuery.isLoading ? <p>Caricamento corsi…</p> : null}
        {coursesQuery.error ? <p className="form-error">Errore: {coursesQuery.error.message}</p> : null}

        {!coursesQuery.isLoading && !coursesQuery.error && filteredCourses.length === 0 ? (
          <div className="course-empty-state">
            <div>
              <strong>{search ? 'Nessun corso corrisponde alla ricerca.' : 'Non hai ancora creato corsi.'}</strong>
              <p>{search ? 'Prova a modificare il testo cercato.' : 'Crea il primo corso per iniziare ad aggiungere partecipanti e gestire le quote.'}</p>
            </div>
            {!search && canManageCourses ? (
              <button className="topbar__button topbar__button--primary" type="button" onClick={openCreate}><Plus size={17} /> Crea il primo corso</button>
            ) : null}
          </div>
        ) : null}

        <div className="cardsGrid course-cards-grid">
          {filteredCourses.map((course) => (
            <article className="page-card course-card" key={course.id} style={{ borderTop: `4px solid ${course.colore || '#6d5dfc'}` }}>
              <div className="section-head section-head--compact">
                <div>
                  <h3>{course.nome}</h3>
                  <p>{course.livello || 'Livello non indicato'} · {course.giorno_settimana || 'Giorno non indicato'}</p>
                </div>
                <span className={course.attivo ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{course.attivo ? 'Attivo' : 'Non attivo'}</span>
              </div>
              <div className="course-meta-grid">
                <span><strong>Orario</strong>{time(course.ora_inizio)} - {time(course.ora_fine)}</span>
                <span><strong>Prezzo</strong>{money(course.prezzo_mensile)}</span>
                <span><strong>Sala</strong>{course.sala || '—'}</span>
                <span><strong>Iscritti</strong>{course.participants_count || 0}</span>
              </div>
              <p className="simple-list__meta">{course.descrizione || 'Nessuna descrizione.'}</p>
              <div className="rowActions course-card-actions">
                <button className="actionBtn" type="button" onClick={() => setSelectedCourse(course)}><Users size={15} /> Partecipanti</button>
                {canManageCourses ? (
                  <>
                    <button className="actionBtn" type="button" onClick={() => openEdit(course)}><Pencil size={15} /> Modifica</button>
                    <button
                      className="actionBtn actionBtn--danger course-delete-trigger"
                      type="button"
                      onClick={() => {
                        setNotice('')
                        deleteMutation.reset()
                        setCourseToDelete(course)
                      }}
                    >
                      <Trash2 size={15} /> Elimina
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      {selectedCourse ? (
        <div className="modalOverlay" onClick={() => setSelectedCourse(null)}>
          <div className="modalCard large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Partecipanti · {selectedCourse.nome}</h3>
                <p>{filteredParticipants.length} partecipanti visualizzati.</p>
              </div>
              <button className="topbar__button" onClick={() => setSelectedCourse(null)}><X size={16} /> Chiudi</button>
            </div>
            {canManageCourses ? (
              <form className="course-enroll-box" onSubmit={handleAddParticipant}>
                <div>
                  <strong>Aggiungi corsista al corso</strong>
                  <p>Seleziona un tesserato/corsista dal database Orchidea Allievi.</p>
                </div>
                <input className="searchInput" value={studentPickerSearch} onChange={(e) => setStudentPickerSearch(e.target.value)} placeholder="Cerca corsista da aggiungere…" />
                <select className="filterSelect" value={studentToAdd} onChange={(e) => setStudentToAdd(e.target.value)}>
                  <option value="">— Seleziona corsista —</option>
                  {availableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.nomeCompleto || `${student.nome || ''} ${student.cognome || ''}`.trim() || student.email || 'Senza nome'}{student.email ? ` · ${student.email}` : ''}
                    </option>
                  ))}
                </select>
                <button className="topbar__button topbar__button--primary" disabled={!studentToAdd || addParticipantMutation.isPending}>
                  {addParticipantMutation.isPending ? 'Aggiungo…' : 'Aggiungi al corso'}
                </button>
                {studentsQuery.error ? <p className="form-error">Errore corsisti: {studentsQuery.error.message}</p> : null}
                {addParticipantMutation.error ? <p className="form-error">Errore iscrizione: {addParticipantMutation.error.message}</p> : null}
              </form>
            ) : null}

            <input className="searchInput" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Cerca partecipante…" />
            {participantsQuery.isLoading ? <p>Caricamento partecipanti…</p> : null}
            {participantsQuery.error ? <p className="form-error">Errore: {participantsQuery.error.message}</p> : null}
            <div className="tableWrap">
              <table className="dataTable">
                <thead><tr><th>Allievo</th><th>Email</th><th>Telefono</th><th>Tessera</th><th>Stato iscrizione</th><th>Tariffa</th><th>Azioni</th></tr></thead>
                <tbody>
                  {filteredParticipants.length === 0 ? <tr><td colSpan="7">Nessun partecipante.</td></tr> : filteredParticipants.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.student?.nomeCompleto || 'Senza nome'}</strong><br /><small>{row.student?.cf || 'Codice fiscale non indicato'}</small></td>
                      <td>{row.student?.email || '—'}</td>
                      <td>{row.student?.telefono || '—'}</td>
                      <td>{row.student?.numero_tessera || '—'}</td>
                      <td><span className="nova-pill nova-pill--neutral">{row.stato || 'attivo'}</span></td>
                      <td>{money(row.tariffa_mensile)}</td>
                      <td>
                        {canManageCourses ? (
                          <button
                            className="actionBtn actionBtn--danger"
                            type="button"
                            onClick={() => removeParticipantMutation.mutate(row.id)}
                            disabled={removeParticipantMutation.isPending}
                          >
                            Rimuovi
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {courseToDelete ? (
        <div
          className="modalOverlay"
          role="presentation"
          onClick={() => {
            if (!deleteMutation.isPending) setCourseToDelete(null)
          }}
        >
          <div
            className="modalCard course-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="course-delete-icon" aria-hidden="true">
              <AlertTriangle size={26} />
            </div>
            <div className="course-delete-copy">
              <div className="course-editor-eyebrow course-delete-eyebrow">Elimina corso</div>
              <h3 id="course-delete-title">Sei sicuro di voler eliminare questo corso?</h3>
              <p>
                Stai per eliminare <strong>“{courseToDelete.nome}”</strong>.
                Questa operazione è definitiva e il corso non sarà più disponibile nelle iscrizioni e nelle nuove assegnazioni.
              </p>
              {Number(courseToDelete.participants_count || 0) > 0 ? (
                <div className="course-delete-warning">
                  Il corso risulta associato a <strong>{courseToDelete.participants_count}</strong>{' '}
                  {Number(courseToDelete.participants_count) === 1 ? 'corsista' : 'corsisti'}.
                  Se il database protegge i dati collegati, Nova impedirà l’eliminazione e potrai disattivare il corso dalla modifica.
                </div>
              ) : null}
              {deleteMutation.error ? (
                <p className="form-error course-delete-error">{deleteMutation.error.message}</p>
              ) : null}
            </div>
            <div className="modalActions course-delete-actions">
              <button
                type="button"
                className="topbar__button"
                onClick={() => setCourseToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Annulla
              </button>
              <button
                type="button"
                className="topbar__button course-confirm-delete"
                onClick={() => deleteMutation.mutate(courseToDelete.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={17} />
                {deleteMutation.isPending ? 'Eliminazione…' : 'Sì, elimina corso'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="modalOverlay" onClick={closeCourseEditor}>
          <div className="modalCard course-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-head course-editor-header">
              <div>
                <div className="course-editor-eyebrow">{creating ? 'Nuovo corso' : 'Modifica corso'}</div>
                <h3>{creating ? 'Crea un nuovo corso' : editing?.nome}</h3>
                <p>{creating ? 'Inserisci i dati principali. Potrai aggiungere i corsisti subito dopo la creazione.' : 'Aggiorna i dati che vengono usati in corsi, iscrizioni e pagamenti.'}</p>
              </div>
              <button type="button" className="course-editor-close" onClick={closeCourseEditor} aria-label="Chiudi"><X size={19} /></button>
            </div>

            <form className="formGrid course-editor-form" onSubmit={handleSubmit}>
              <label>Nome corso *<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Es. Bachata Base" required autoFocus /></label>
              <label>Disciplina<input value={form.disciplina} onChange={(e) => setForm({ ...form, disciplina: e.target.value })} placeholder="Es. Bachata" /></label>
              <label>Livello<input value={form.livello} onChange={(e) => setForm({ ...form, livello: e.target.value })} placeholder="Es. Base, Intermedio…" /></label>
              <label>Giorno<input list="course-weekdays" value={form.giorno_settimana} onChange={(e) => setForm({ ...form, giorno_settimana: e.target.value })} placeholder="Es. Lunedì" />
                <datalist id="course-weekdays">{weekDays.map((day) => <option value={day} key={day} />)}</datalist>
              </label>
              <label>Ora inizio<input type="time" value={form.ora_inizio} onChange={(e) => setForm({ ...form, ora_inizio: e.target.value })} /></label>
              <label>Ora fine<input type="time" value={form.ora_fine} onChange={(e) => setForm({ ...form, ora_fine: e.target.value })} /></label>
              <label>Prezzo mensile<input type="number" min="0" step="0.01" value={form.prezzo_mensile} onChange={(e) => setForm({ ...form, prezzo_mensile: e.target.value })} placeholder="0,00" /></label>
              <label>Sala<input value={form.sala} onChange={(e) => setForm({ ...form, sala: e.target.value })} placeholder="Es. Sala 1" /></label>
              <label>Insegnante/i<input value={form.insegnante} onChange={(e) => setForm({ ...form, insegnante: e.target.value })} placeholder="Es. Laura, Manuel" /></label>
              <label className="course-color-field">Colore corso
                <span className="course-color-control">
                  <input type="color" value={form.colore} onChange={(e) => setForm({ ...form, colore: e.target.value })} />
                  <span>{form.colore.toUpperCase()}</span>
                </span>
              </label>
              <label className="formFull">Descrizione<textarea className="formTextarea" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Informazioni utili sul corso…" /></label>
              <label className="check-card"><input type="checkbox" checked={form.attivo} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} /> Corso attivo e disponibile</label>

              {formError ? <p className="form-error course-form-message">{formError}</p> : null}
              {courseMutationError ? <p className="form-error course-form-message">{courseMutationError.message}</p> : null}

              <div className="modalActions">
                <button type="button" className="topbar__button" onClick={closeCourseEditor} disabled={savingCourse}>Annulla</button>
                <button className="topbar__button topbar__button--primary" disabled={savingCourse}>
                  {savingCourse ? (creating ? 'Creazione…' : 'Salvataggio…') : (creating ? 'Crea corso' : 'Salva corso')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
