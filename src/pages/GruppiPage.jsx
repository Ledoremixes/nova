import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Search, Users, X } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { fetchCourseParticipants, fetchOrchideaCourses, updateOrchideaCourse } from '../api/orchideaEntities'
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

function money(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function time(value) {
  return value ? String(value).slice(0, 5) : '—'
}

export default function GruppiPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [participantSearch, setParticipantSearch] = useState('')

  const coursesQuery = useQuery({
    queryKey: ['orchidea-corsi'],
    queryFn: fetchOrchideaCourses,
  })

  const participantsQuery = useQuery({
    queryKey: ['orchidea-corso-partecipanti', selectedCourse?.id],
    queryFn: () => fetchCourseParticipants(selectedCourse.id),
    enabled: Boolean(selectedCourse?.id),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateOrchideaCourse(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-corsi'] })
      setEditing(null)
    },
  })

  const courses = coursesQuery.data || []
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

  const participants = participantsQuery.data || []
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

  function openEdit(course) {
    setEditing(course)
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
    if (!editing?.id) return
    updateMutation.mutate({ id: editing.id, payload: form })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Corsi Orchidea</div>
          <h2 className="dashboard-hero__title">Corsi e partecipanti</h2>
          <p className="dashboard-hero__text">Qui vedi i corsi del portale allievi, i partecipanti iscritti e puoi modificare i dati principali.</p>
        </div>
      </div>

      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Corsi</h2>
            <p>{filteredCourses.length} corsi trovati.</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="searchWrapper">
            <Search size={18} />
            <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca corso, livello, insegnante, giorno…" />
          </div>
        </div>

        {coursesQuery.isLoading ? <p>Caricamento corsi…</p> : null}
        {coursesQuery.error ? <p className="form-error">Errore: {coursesQuery.error.message}</p> : null}

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
              <div className="rowActions">
                <button className="actionBtn" onClick={() => setSelectedCourse(course)}><Users size={15} /> Partecipanti</button>
                {isAdmin ? <button className="actionBtn" onClick={() => openEdit(course)}><Pencil size={15} /> Modifica</button> : null}
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
            <input className="searchInput" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Cerca partecipante…" />
            {participantsQuery.isLoading ? <p>Caricamento partecipanti…</p> : null}
            {participantsQuery.error ? <p className="form-error">Errore: {participantsQuery.error.message}</p> : null}
            <div className="tableWrap">
              <table className="dataTable">
                <thead><tr><th>Allievo</th><th>Email</th><th>Telefono</th><th>Tessera</th><th>Stato iscrizione</th><th>Tariffa</th></tr></thead>
                <tbody>
                  {filteredParticipants.length === 0 ? <tr><td colSpan="6">Nessun partecipante.</td></tr> : filteredParticipants.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.student?.nomeCompleto || 'Senza nome'}</strong><br /><small>{row.student?.cf || 'Codice fiscale non indicato'}</small></td>
                      <td>{row.student?.email || '—'}</td>
                      <td>{row.student?.telefono || '—'}</td>
                      <td>{row.student?.numero_tessera || '—'}</td>
                      <td><span className="nova-pill nova-pill--neutral">{row.stato || 'attivo'}</span></td>
                      <td>{money(row.tariffa_mensile)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="modalOverlay" onClick={() => setEditing(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>Modifica corso</h3><p>{editing.nome}</p></div></div>
            <form className="formGrid" onSubmit={handleSubmit}>
              <label>Nome<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></label>
              <label>Disciplina<input value={form.disciplina} onChange={(e) => setForm({ ...form, disciplina: e.target.value })} /></label>
              <label>Livello<input value={form.livello} onChange={(e) => setForm({ ...form, livello: e.target.value })} /></label>
              <label>Giorno<input value={form.giorno_settimana} onChange={(e) => setForm({ ...form, giorno_settimana: e.target.value })} /></label>
              <label>Ora inizio<input type="time" value={form.ora_inizio} onChange={(e) => setForm({ ...form, ora_inizio: e.target.value })} /></label>
              <label>Ora fine<input type="time" value={form.ora_fine} onChange={(e) => setForm({ ...form, ora_fine: e.target.value })} /></label>
              <label>Prezzo mensile<input type="number" step="0.01" value={form.prezzo_mensile} onChange={(e) => setForm({ ...form, prezzo_mensile: e.target.value })} /></label>
              <label>Sala<input value={form.sala} onChange={(e) => setForm({ ...form, sala: e.target.value })} /></label>
              <label>Insegnante<input value={form.insegnante} onChange={(e) => setForm({ ...form, insegnante: e.target.value })} /></label>
              <label>Colore<input type="color" value={form.colore} onChange={(e) => setForm({ ...form, colore: e.target.value })} /></label>
              <label className="formFull">Descrizione<textarea className="formTextarea" value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} /></label>
              <label className="check-card"><input type="checkbox" checked={form.attivo} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} /> Corso attivo</label>
              {updateMutation.error ? <p className="form-error">{updateMutation.error.message}</p> : null}
              <div className="modalActions">
                <button type="button" className="topbar__button" onClick={() => setEditing(null)}>Annulla</button>
                <button className="topbar__button topbar__button--primary" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Salvo…' : 'Salva corso'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
