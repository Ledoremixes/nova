import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, Pencil, Search, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { createOrchideaTeacher, deleteOrchideaTeacher, fetchOrchideaTeachers, updateOrchideaTeacher } from '../api/orchideaEntities'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  bio: '',
  coursesText: '',
  photo_url: '',
  active: true,
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export default function InsegnantiPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const teachersQuery = useQuery({
    queryKey: ['orchidea-teachers', search],
    queryFn: () => fetchOrchideaTeachers({ search }),
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

  const teachers = teachersQuery.data || []
  const teacherCount = useMemo(() => teachers.length, [teachers])

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

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Staff didattico</div>
          <h2 className="dashboard-hero__title">Insegnanti</h2>
          <p className="dashboard-hero__text">Sezione collegata al database Orchidea Allievi, con schede più leggibili e modifica dati.</p>
        </div>
        {isAdmin ? <button className="topbar__button topbar__button--primary" onClick={openCreate}>Nuovo insegnante</button> : null}
      </div>

      <div className="stats-grid">
        <div className="page-card tesserati-stat-card"><span>Totale insegnanti</span><strong>{teacherCount}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Attivi</span><strong>{teachers.filter((t) => t.active !== false).length}</strong></div>
      </div>

      <div className="page-card">
        <div className="toolbar">
          <div className="searchWrapper"><Search size={18} /><input className="searchInput" placeholder="Cerca per nome, email o corso…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
        {teachersQuery.isLoading ? <p>Caricamento insegnanti…</p> : null}
        {teachersQuery.error ? <p className="form-error">Errore: {teachersQuery.error.message}</p> : null}

        <div className="cardsGrid teacher-card-grid">
          {teachers.map((row) => (
            <article className="page-card teacher-profile-card" key={`${row._table}-${row.id}`}>
              <div className="teacher-profile-head">
                {row.photo_url ? <img className="teacherAvatar teacherAvatar--large" src={row.photo_url} alt={row.full_name} /> : <div className="teacherAvatar teacherAvatar--large teacherAvatar--placeholder">{initials(row.full_name)}</div>}
                <div>
                  <h3>{row.full_name}</h3>
                  <p>{row.bio || 'Nessuna bio inserita.'}</p>
                  <span className={row.active !== false ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{row.active !== false ? 'Attivo' : 'Non attivo'}</span>
                </div>
              </div>
              <div className="teacher-info-grid">
                <span><strong>Email</strong>{row.email || '—'}</span>
                <span><strong>Telefono</strong>{row.phone || '—'}</span>
                <span><strong>Fonte</strong>{row._table === 'teachers_nova' ? 'Nova' : 'Orchidea Allievi'}</span>
              </div>
              <div className="tagWrap">
                {row.courses?.length ? row.courses.map((course, idx) => <span className="status-badge" key={`${course}-${idx}`}>{course}</span>) : <span className="simple-list__meta">Nessun corso indicato</span>}
              </div>
              <div className="rowActions">
                <button className="actionBtn" onClick={() => setSelectedTeacher(row)}><GraduationCap size={15} /> Scheda</button>
                {isAdmin ? <button className="actionBtn" onClick={() => openEdit(row)}><Pencil size={15} /> Modifica</button> : null}
                {isAdmin ? <button className="actionBtn actionBtn--danger" onClick={() => remove(row)}><Trash2 size={15} /> Elimina</button> : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      {selectedTeacher ? (
        <div className="modalOverlay" onClick={() => setSelectedTeacher(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>{selectedTeacher.full_name}</h3><p>Scheda insegnante</p></div><button className="topbar__button" onClick={() => setSelectedTeacher(null)}><X size={16} /> Chiudi</button></div>
            <div className="detailGrid">
              <div>
                <p><strong>Email:</strong> {selectedTeacher.email || '—'}</p>
                <p><strong>Telefono:</strong> {selectedTeacher.phone || '—'}</p>
                <p><strong>Bio:</strong> {selectedTeacher.bio || '—'}</p>
                <p><strong>Corsi:</strong> {selectedTeacher.courses?.length ? selectedTeacher.courses.join(', ') : '—'}</p>
              </div>
              <div className="page-card tesserati-nested-card"><GraduationCap size={32} /><h3>Archivio staff</h3><p>Questa scheda può essere modificata dagli admin.</p></div>
            </div>
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>{editing ? 'Modifica insegnante' : 'Nuovo insegnante'}</h3><p>Dati principali e corsi separati da virgola.</p></div></div>
            <form className="formGrid" onSubmit={submit}>
              <label>Nome completo<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label>Foto URL<input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} /></label>
              <label className="formFull">Corsi<input value={form.coursesText} onChange={(e) => setForm({ ...form, coursesText: e.target.value })} placeholder="Bachata base, Salsa intermedio…" /></label>
              <label className="formFull">Bio<textarea className="formTextarea" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
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
