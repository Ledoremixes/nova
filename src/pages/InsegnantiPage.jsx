import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import {
  fetchTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  fetchTeacherDocuments,
  uploadTeacherPhoto,
} from '../api/teachers'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  bio: '',
  coursesText: '',
  photo_url: '',
  photo_path: '',
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
  const [photoFile, setPhotoFile] = useState(null)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['teachers', search],
    queryFn: () => fetchTeachers({ search }),
  })

  const documentsQuery = useQuery({
    queryKey: ['teacher-documents', selectedTeacher?.id],
    queryFn: () => fetchTeacherDocuments(selectedTeacher.id),
    enabled: !!selectedTeacher?.id,
  })

  const createMutation = useMutation({
    mutationFn: createTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTeacher(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      queryClient.invalidateQueries({ queryKey: ['teacher-documents'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
      if (selectedTeacher) setSelectedTeacher(null)
    },
  })

  const teacherCount = useMemo(() => data.length, [data])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setPhotoFile(null)
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
      photo_path: row.photo_path || '',
    })
    setPhotoFile(null)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setPhotoFile(null)
  }

  function onChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const basePayload = {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      bio: form.bio || null,
      courses: form.coursesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      photo_url: form.photo_url || null,
      photo_path: form.photo_path || null,
    }

    if (editing) {
      let payload = { ...basePayload }

      if (photoFile) {
        const uploaded = await uploadTeacherPhoto(photoFile, editing.id)
        payload.photo_url = uploaded.photo_url
        payload.photo_path = uploaded.photo_path
      }

      updateMutation.mutate({ id: editing.id, payload })
      return
    }

    createMutation.mutate(basePayload, {
      onSuccess: async (createdTeacher) => {
        if (photoFile && createdTeacher?.id) {
          const uploaded = await uploadTeacherPhoto(photoFile, createdTeacher.id)
          await updateTeacher(createdTeacher.id, {
            photo_url: uploaded.photo_url,
            photo_path: uploaded.photo_path,
          })
          queryClient.invalidateQueries({ queryKey: ['teachers'] })
        }
        closeModal()
      },
    })
  }

  function handleDelete(row) {
    const ok = window.confirm(`Eliminare ${row.full_name || 'questo insegnante'}?`)
    if (!ok) return
    deleteMutation.mutate(row.id)
  }

  return (
    <section className="page">
      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Insegnanti</h2>
            <p>Archivio insegnanti con corsi, foto profilo e documenti.</p>
          </div>

          {isAdmin ? (
            <button className="topbar__button topbar__button--primary" onClick={openCreate}>
              Nuovo insegnante
            </button>
          ) : null}
        </div>

        <div className="toolbar">
          <input
            className="searchInput"
            type="text"
            placeholder="Cerca per nome o email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card__title">Totale insegnanti</div>
            <div className="stat-card__value">{teacherCount}</div>
            <div className="stat-card__hint">Archivio completo</div>
          </div>
        </div>

        {isLoading ? <p>Caricamento insegnanti...</p> : null}
        {error ? <p>Errore: {error.message}</p> : null}

        {!isLoading && !error ? (
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Insegnante</th>
                  <th>Email</th>
                  <th>Telefono</th>
                  <th>Corsi</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan="5">Nessun insegnante trovato.</td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="teacherCell">
                          {(row.photo_signed_url || row.photo_url) ? (
                            <img
                              className="teacherAvatar"
                              src={row.photo_signed_url || row.photo_url}
                              alt={row.full_name}
                            />
                          ) : (
                            <div className="teacherAvatar teacherAvatar--placeholder">
                              {String(row.full_name || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="simple-list__title">{row.full_name || '-'}</div>
                            <div className="simple-list__meta">{row.bio || 'Nessuna bio'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.email || '-'}</td>
                      <td>{row.phone || '-'}</td>
                      <td>
                        <div className="tagWrap">
                          {Array.isArray(row.courses) && row.courses.length > 0
                            ? row.courses.map((course, idx) => (
                                <span key={`${course}-${idx}`} className="status-badge">
                                  {course}
                                </span>
                              ))
                            : '-'}
                        </div>
                      </td>
                      <td>
                        <div className="rowActions">
                          <button className="actionBtn" onClick={() => setSelectedTeacher(row)}>
                            Dettagli
                          </button>
                          {isAdmin ? (
                            <>
                              <button className="actionBtn" onClick={() => openEdit(row)}>
                                Modifica
                              </button>
                              <button
                                className="actionBtn actionBtn--danger"
                                onClick={() => handleDelete(row)}
                              >
                                Elimina
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {selectedTeacher ? (
        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>{selectedTeacher.full_name}</h3>
              <p>Documenti associati all’insegnante</p>
            </div>
            <button className="topbar__button" onClick={() => setSelectedTeacher(null)}>
              Chiudi
            </button>
          </div>

          <div className="detailGrid">
            <div>
              <p><strong>Email:</strong> {selectedTeacher.email || '-'}</p>
              <p><strong>Telefono:</strong> {selectedTeacher.phone || '-'}</p>
              <p><strong>Bio:</strong> {selectedTeacher.bio || '-'}</p>
              <p>
                <strong>Corsi:</strong>{' '}
                {Array.isArray(selectedTeacher.courses) && selectedTeacher.courses.length > 0
                  ? selectedTeacher.courses.join(', ')
                  : '-'}
              </p>
            </div>

            <div>
              {(selectedTeacher.photo_signed_url || selectedTeacher.photo_url) ? (
                <img
                  className="teacherPhotoLarge"
                  src={selectedTeacher.photo_signed_url || selectedTeacher.photo_url}
                  alt={selectedTeacher.full_name}
                />
              ) : (
                <div className="teacherPhotoLarge teacherPhotoLarge--empty">Nessuna foto</div>
              )}
            </div>
          </div>

          <div className="section-head" style={{ marginTop: 24 }}>
            <div>
              <h3>Documenti</h3>
              <p>Cedolini e file collegati a questo insegnante</p>
            </div>
          </div>

          {documentsQuery.isLoading ? <p>Caricamento documenti...</p> : null}
          {documentsQuery.error ? <p>Errore: {documentsQuery.error.message}</p> : null}

          {!documentsQuery.isLoading && !documentsQuery.error ? (
            <div className="tableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Mese</th>
                    <th>Nome file</th>
                    <th>Path</th>
                    <th>Data upload</th>
                  </tr>
                </thead>
                <tbody>
                  {(documentsQuery.data || []).length === 0 ? (
                    <tr>
                      <td colSpan="5">Nessun documento disponibile.</td>
                    </tr>
                  ) : (
                    (documentsQuery.data || []).map((doc) => (
                      <tr key={doc.id}>
                        <td>{doc.type || '-'}</td>
                        <td>{doc.month || '-'}</td>
                        <td>{doc.file_name || '-'}</td>
                        <td>{doc.file_path || '-'}</td>
                        <td>
                          {doc.uploaded_at
                            ? new Date(doc.uploaded_at).toLocaleDateString('it-IT')
                            : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {isOpen ? (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>{editing ? 'Modifica insegnante' : 'Nuovo insegnante'}</h3>
                <p>Compila i dati principali e i corsi separati da virgola.</p>
              </div>
            </div>

            <form className="formGrid" onSubmit={handleSubmit}>
              <input
                name="full_name"
                placeholder="Nome completo"
                value={form.full_name}
                onChange={onChange}
                required
              />
              <input
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={onChange}
              />
              <input
                name="phone"
                placeholder="Telefono"
                value={form.phone}
                onChange={onChange}
              />
              <input
                name="coursesText"
                placeholder="Corsi (separati da virgola)"
                value={form.coursesText}
                onChange={onChange}
              />
              <textarea
                className="formTextarea"
                name="bio"
                placeholder="Bio"
                value={form.bio}
                onChange={onChange}
              />

              <div className="formFileBlock">
                <label>Foto profilo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="modalActions">
                <button type="button" className="topbar__button" onClick={closeModal}>
                  Annulla
                </button>
                <button
                  type="submit"
                  className="topbar__button topbar__button--primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? 'Salva modifiche' : 'Crea insegnante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}