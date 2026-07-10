import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, BookOpenCheck, Euro, IdCard, Mail, Phone, Plus, Search, Sparkles, Trash2, UserCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { addCourseParticipant, fetchOrchideaCourses, fetchOrchideaStudents, removeCourseParticipant, updateTesserato } from '../api/orchideaEntities'
import { fetchTesseratoDetails } from '../api/tesserati'
import '../styles/AtletiPage.css'

function fullName(row) {
  return row.nomeCompleto || `${row.nome || ''} ${row.cognome || ''}`.trim() || 'Senza nome'
}

function initials(row) {
  return fullName(row).split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

function money(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(number)
}

export default function AtletiPage() {
  const { role } = useAuth()
  const currentRole = String(role || '').trim().toLowerCase()
  const canEdit = currentRole === 'admin' || currentRole === 'user'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [onlyCorsisti, setOnlyCorsisti] = useState(true)
  const [selected, setSelected] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [tariffa, setTariffa] = useState('')

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
  })

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-atleti'],
    queryFn: fetchOrchideaCourses,
  })

  const detailsQuery = useQuery({
    queryKey: ['atleta-details-courses', selected?.id],
    queryFn: () => fetchTesseratoDetails(selected.id),
    enabled: !!selected?.id,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTesserato(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-atleti-corsisti'] })
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
    },
  })

  const addCourseMutation = useMutation({
    mutationFn: addCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atleta-details-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      setSelectedCourseId('')
      setTariffa('')
    },
  })

  const removeCourseMutation = useMutation({
    mutationFn: removeCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atleta-details-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
    },
  })

  const rows = studentsQuery.data || []
  const courses = coursesQuery.data || []
  const details = detailsQuery.data || { enrollments: [], payments: [] }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyCorsisti && !row.is_corsista) return false
      if (!term) return true
      return [fullName(row), row.email, row.telefono, row.cf, row.numero_tessera]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [rows, search, onlyCorsisti])

  const assignedCourseIds = new Set((details.enrollments || []).map((item) => String(item.corso_id)))
  const availableCourses = courses.filter((course) => !assignedCourseIds.has(String(course.id)))
  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId))
  const monthlyTotal = (details.enrollments || []).reduce((sum, item) => {
    return sum + Number(item.quota_allievo_mensile ?? item.tariffa_mensile ?? item.corsi?.prezzo_mensile ?? 0)
  }, 0)

  function toggleCorsista(row) {
    if (!canEdit) return
    updateMutation.mutate({
      id: row.id,
      payload: {
        ...row.raw,
        is_corsista: !row.is_corsista,
      },
    })
  }

  function addSelectedCourse(e) {
    e.preventDefault()
    if (!selected?.id || !selectedCourseId) return
    addCourseMutation.mutate({
      courseId: selectedCourseId,
      studentId: selected.id,
      tariffaMensile: tariffa,
    })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Atleti / corsisti</div>
          <h2 className="dashboard-hero__title">Archivio corsisti da Orchidea Allievi</h2>
          <p className="dashboard-hero__text">Cerca gli allievi, gestisci il ruolo corsista e assegna uno o più corsi direttamente dalla scheda atleta.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="page-card tesserati-stat-card"><span>Totale anagrafiche</span><strong>{rows.length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Corsisti</span><strong>{rows.filter((r) => r.is_corsista).length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Visibili ora</span><strong>{filtered.length}</strong></div>
      </div>

      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Atleti</h2>
            <p>Cerca per nome, cognome, email, telefono, codice fiscale o tessera.</p>
          </div>
        </div>

        <div className="toolbar toolbar--wrap">
          <div className="searchWrapper">
            <Search size={18} />
            <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca atleta/corsista…" />
          </div>
          <label className="atleti-filter-switch">
            <input type="checkbox" checked={onlyCorsisti} onChange={(e) => setOnlyCorsisti(e.target.checked)} />
            <span className="atleti-filter-switch__track"><span /></span>
            <span className="atleti-filter-switch__copy"><strong>Solo corsisti</strong><small>{onlyCorsisti ? 'Filtro attivo' : 'Mostra tutti gli atleti'}</small></span>
          </label>
        </div>

        {studentsQuery.isLoading ? <p>Caricamento atleti…</p> : null}
        {studentsQuery.error ? <p className="form-error">Errore: {studentsQuery.error.message}</p> : null}

        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Atleta</th><th>Email</th><th>Telefono</th><th>Cod. fiscale</th><th>Tessera</th><th>Ruolo</th><th>Azioni</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="7">Nessun atleta trovato.</td></tr> : filtered.map((row) => (
                <tr key={row.id}>
                  <td><div className="tesserati-person-cell"><span className="tesserati-avatar">{initials(row)}</span><div><strong>{fullName(row)}</strong><small>{row.stagione || 'Stagione non indicata'}</small></div></div></td>
                  <td>{row.email || '—'}</td>
                  <td>{row.telefono || '—'}</td>
                  <td>{row.cf || '—'}</td>
                  <td>{row.numero_tessera || '—'}</td>
                  <td><span className={row.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{row.is_corsista ? 'Corsista' : 'Tesserato'}</span></td>
                  <td><div className="rowActions"><button className="actionBtn" onClick={() => setSelected(row)}>Scheda corsi</button>{canEdit ? <button className="actionBtn" onClick={() => toggleCorsista(row)}>{row.is_corsista ? 'Rimuovi corsista' : 'Rendi corsista'}</button> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalCard large-modal atleti-course-modal" onClick={(e) => e.stopPropagation()}>
            <div className="atleti-course-hero">
              <div className="atleti-course-identity">
                <span className="atleti-course-avatar">{initials(selected)}</span>
                <div>
                  <div className="dashboard-hero__eyebrow">Scheda corsi atleta</div>
                  <h3>{fullName(selected)}</h3>
                  <p>Collega i corsi, controlla il pacchetto mensile e prepara le quote nella sezione Pagamenti.</p>
                  <div className="atleti-course-hero-chips">
                    <span className={selected.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{selected.is_corsista ? 'Corsista' : 'Tesserato'}</span>
                    <span className="nova-pill nova-pill--neutral">{selected.numero_tessera || 'Senza tessera'}</span>
                    <span className="nova-pill nova-pill--neutral">{details.enrollments?.length || 0} corsi collegati</span>
                  </div>
                </div>
              </div>
              <button className="student-profile-close" onClick={() => setSelected(null)}>Chiudi</button>
            </div>

            <div className="atleti-course-summary-grid">
              <div className="atleti-profile-card">
                <div className="atleti-profile-card__head">
                  <UserCheck size={22} />
                  <div>
                    <h3>Dati atleta</h3>
                    <p>Anagrafica collegata a Orchidea Allievi.</p>
                  </div>
                </div>
                <div className="atleti-profile-facts">
                  <span><Mail size={16} /><strong>Email</strong><em>{selected.email || '—'}</em></span>
                  <span><Phone size={16} /><strong>Telefono</strong><em>{selected.telefono || '—'}</em></span>
                  <span><IdCard size={16} /><strong>Codice fiscale</strong><em>{selected.cf || '—'}</em></span>
                  <span><BadgeCheck size={16} /><strong>Tessera</strong><em>{selected.numero_tessera || '—'}</em></span>
                </div>
              </div>

              <div className="atleti-package-card">
                <div className="atleti-package-icon"><BookOpenCheck size={26} /></div>
                <span>Pacchetto mensile</span>
                <strong>{money(monthlyTotal)}</strong>
                <p>{details.enrollments?.length || 0} corsi attivi collegati all’allievo.</p>
              </div>
            </div>

            <div className="atleti-assignment-card">
              <div className="atleti-assignment-head">
                <div>
                  <div className="dashboard-hero__eyebrow">Assegnazione corsi</div>
                  <h3>Collega un nuovo corso</h3>
                  <p>Qui colleghi i corsi. Per sconti, pacchetti e quota insegnante usa la nuova sezione Pacchetti.</p>
                </div>
                <Sparkles size={24} />
              </div>

              {canEdit ? (
                <form className="atleti-course-form" onSubmit={addSelectedCourse}>
                  <label>
                    <span>Corso</span>
                    <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                      <option value="">Seleziona corso</option>
                      {availableCourses.map((course) => <option value={course.id} key={course.id}>{course.nome} {course.livello ? `· ${course.livello}` : ''}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Tariffa personalizzata</span>
                    <div className="atleti-price-input">
                      <Euro size={17} />
                      <input value={tariffa} onChange={(e) => setTariffa(e.target.value)} placeholder={selectedCourse?.prezzo_mensile ? `Prezzo corso ${money(selectedCourse.prezzo_mensile)}` : 'Lascia vuoto per prezzo corso'} type="number" step="0.01" />
                    </div>
                  </label>
                  <button className="topbar__button topbar__button--primary atleti-add-course-btn" disabled={!selectedCourseId || addCourseMutation.isPending}>
                    <Plus size={17} /> {addCourseMutation.isPending ? 'Aggiungo…' : 'Aggiungi corso'}
                  </button>
                </form>
              ) : (
                <p className="muted-text">Non hai i permessi per modificare i corsi collegati.</p>
              )}

              {addCourseMutation.error ? <p className="form-error">{addCourseMutation.error.message}</p> : null}
              {removeCourseMutation.error ? <p className="form-error">{removeCourseMutation.error.message}</p> : null}
            </div>

            <div className="atleti-linked-courses-card">
              <div className="atleti-linked-courses-head">
                <div>
                  <h3>Corsi collegati</h3>
                  <p>Riepilogo corsi inclusi nel pacchetto dell’allievo.</p>
                </div>
                <span className="nova-pill nova-pill--neutral">{details.enrollments?.length || 0} totali</span>
              </div>

              {detailsQuery.isLoading ? <p>Caricamento corsi collegati…</p> : null}
              {(details.enrollments || []).length === 0 && !detailsQuery.isLoading ? (
                <div className="atleti-empty-courses">
                  <BookOpenCheck size={28} />
                  <strong>Nessun corso collegato</strong>
                  <p>Seleziona un corso dal box sopra per creare il pacchetto dell’allievo.</p>
                </div>
              ) : null}

              <div className="atleti-linked-course-list">
                {(details.enrollments || []).map((item) => (
                  <div className="atleti-linked-course-row" key={item.id}>
                    <div className="atleti-linked-course-main">
                      <span className="atleti-linked-course-dot" />
                      <div>
                        <strong>{item.corsi?.nome || 'Corso'}</strong>
                        <small>{item.corsi?.livello || 'Livello non impostato'} · {item.tipo_pagamento || 'mensile'} · {money(item.quota_allievo_mensile ?? item.tariffa_mensile ?? item.corsi?.prezzo_mensile)} / mese</small>
                        {item.corsi?.giorno_settimana || item.corsi?.ora_inizio ? (
                          <small>{item.corsi?.giorno_settimana || 'Giorno non impostato'} {item.corsi?.ora_inizio || ''}{item.corsi?.ora_fine ? ` - ${item.corsi.ora_fine}` : ''}</small>
                        ) : null}
                      </div>
                    </div>
                    {canEdit ? <button className="payments-icon-btn danger atleti-remove-course-btn" onClick={() => removeCourseMutation.mutate(item.id)} disabled={removeCourseMutation.isPending}><Trash2 size={15} /></button> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
