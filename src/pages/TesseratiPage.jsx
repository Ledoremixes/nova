import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import {
  fetchTesserati,
  fetchTesseratoDetails,
  updateTesserato,
  toggleCorsista,
  generateMembershipNumber,
  generateMissingMembershipNumbers,
} from '../api/tesserati'
import { hasCustomMembershipNumber, membershipCode } from '../lib/membership'
import { getOrchideaConfigStatus, getOrchideaAuthStatus } from '../api/orchideaSupabase'
import { changeTesseratoPassword } from '../api/orchideaEntities'
import '../styles/TesseratiPage.css'

const emptyStudentForm = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  cf: '',
  nascita: '',
  luogo: '',
  residenza: '',
  numero_tessera: '',
  stagione: '2026/2027',
  status: 'pending_payment',
  payment_status: 'unpaid',
  tessera_attiva: true,
  is_corsista: false,
}

function fullName(student) {
  return `${student?.nome || ''} ${student?.cognome || ''}`.trim() || 'Senza nome'
}

function initials(student) {
  const first = String(student?.nome || '').trim().charAt(0)
  const last = String(student?.cognome || '').trim().charAt(0)
  return `${first}${last}`.trim().toUpperCase() || 'OR'
}

function buildStudentForm(student) {
  if (!student) return emptyStudentForm

  return {
    nome: student.nome || '',
    cognome: student.cognome || '',
    email: student.email || '',
    telefono: student.telefono || '',
    cf: student.cf || '',
    nascita: student.nascita || '',
    luogo: student.luogo || '',
    residenza: student.residenza || '',
    numero_tessera: student.numero_tessera || '',
    stagione: student.stagione || '2026/2027',
    status: student.status || 'pending_payment',
    payment_status: student.payment_status || 'unpaid',
    tessera_attiva: student.tessera_attiva !== false,
    is_corsista: Boolean(student.is_corsista),
  }
}

function searchText(student) {
  return [
    student?.nome,
    student?.cognome,
    student?.email,
    student?.cf,
    student?.telefono,
    student?.residenza,
    student?.numero_tessera,
    membershipCode(student),
    student?.qr_token,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function statusLabel(value) {
  const labels = {
    active: 'Attiva',
    pending_payment: 'In attesa pagamento',
    inactive: 'Non attiva',
    blocked: 'Bloccata',
  }
  return labels[value] || value || '—'
}

function paymentStatusLabel(value) {
  const labels = {
    paid: 'Pagato',
    unpaid: 'Non pagato',
    pending: 'In attesa',
    refunded: 'Rimborsato',
    pagato: 'Pagato',
    da_pagare: 'Da pagare',
    in_attesa: 'In attesa',
  }
  return labels[value] || value || '—'
}

function statusClass(value) {
  if (value === 'active' || value === 'paid' || value === 'pagato') return 'nova-pill nova-pill--ok'
  if (value === 'pending_payment' || value === 'pending' || value === 'unpaid' || value === 'da_pagare' || value === 'in_attesa') return 'nova-pill nova-pill--warn'
  return 'nova-pill nova-pill--neutral'
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('it-IT')
}

function formatTime(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function formatMoney(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

function billingLabel(value) {
  const labels = {
    mensile: 'Mensile',
    trimestrale: 'Trimestrale',
    annuale: 'Annuale',
    all_you_can_dance: 'All You Can Dance',
  }
  return labels[value] || value || 'Mensile'
}

export default function TesseratiPage() {
  const { role, orchideaAuthWarning } = useAuth()
  const currentRole = String(role || '').trim().toLowerCase()
  const isAdmin = currentRole === 'admin'
  const canEditStudent = isAdmin || currentRole === 'user'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [stagione, setStagione] = useState('')
  const [status, setStatus] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentForm, setStudentForm] = useState(emptyStudentForm)
  const [passwordForm, setPasswordForm] = useState({ password: '', password2: '' })

  const { data: authStatus } = useQuery({
    queryKey: ['orchidea-auth-status'],
    queryFn: getOrchideaAuthStatus,
  })

  const { data: students = [], isLoading, error } = useQuery({
    queryKey: ['tesseramenti-orchidea'],
    queryFn: fetchTesserati,
  })

  const detailsQuery = useQuery({
    queryKey: ['tesseramento-details', selectedStudent?.id],
    queryFn: () => fetchTesseratoDetails(selectedStudent.id),
    enabled: Boolean(selectedStudent?.id),
  })

  const stagioniDisponibili = useMemo(() => {
    const set = new Set(students.map((student) => student.stagione).filter(Boolean))
    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)))
  }, [students])

  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return students.filter((student) => {
      const matchesSearch = !needle || searchText(student).includes(needle)
      const matchesSeason = !stagione || student.stagione === stagione
      const matchesStatus = !status || student.status === status
      const matchesRole =
        !roleFilter ||
        (roleFilter === 'corsista' && student.is_corsista) ||
        (roleFilter === 'tesserato' && !student.is_corsista) ||
        (roleFilter === 'attiva' && student.tessera_attiva !== false) ||
        (roleFilter === 'non_attiva' && student.tessera_attiva === false)

      return matchesSearch && matchesSeason && matchesStatus && matchesRole
    })
  }, [students, search, stagione, status, roleFilter])

  const stats = useMemo(() => {
    return {
      total: students.length,
      active: students.filter((student) => student.tessera_attiva !== false).length,
      corsisti: students.filter((student) => student.is_corsista).length,
      missingNumbers: students.filter((student) => !hasCustomMembershipNumber(student)).length,
    }
  }, [students])

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTesserato(id, payload),
    onSuccess: (updated) => {
      setSelectedStudent(updated)
      setStudentForm(buildStudentForm(updated))
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-registry'] })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: ({ student, newPassword }) => changeTesseratoPassword({ student, newPassword }),
    onSuccess: () => {
      setPasswordForm({ password: '', password2: '' })
    },
  })

  const toggleCorsistaMutation = useMutation({
    mutationFn: toggleCorsista,
    onSuccess: (updated) => {
      if (selectedStudent?.id === updated.id) {
        setSelectedStudent(updated)
        setStudentForm(buildStudentForm(updated))
      }
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-registry'] })
    },
  })

  const generateNumberMutation = useMutation({
    mutationFn: generateMembershipNumber,
    onSuccess: (updated) => {
      if (selectedStudent?.id === updated.id) {
        setSelectedStudent(updated)
        setStudentForm(buildStudentForm(updated))
      }
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-registry'] })
    },
  })

  const generateMissingMutation = useMutation({
    mutationFn: generateMissingMembershipNumbers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-registry'] })
    },
  })

  function openStudentDetail(student) {
    setSelectedStudent(student)
    setStudentForm(buildStudentForm(student))
    setPasswordForm({ password: '', password2: '' })
  }

  function closeStudentDetail() {
    setSelectedStudent(null)
    setStudentForm(emptyStudentForm)
    setPasswordForm({ password: '', password2: '' })
  }

  function handleChange(field, value) {
    setStudentForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!selectedStudent || !canEditStudent) return

    updateMutation.mutate({ id: selectedStudent.id, payload: studentForm })
  }

  function handlePasswordChange() {
    if (!selectedStudent || !isAdmin) return
    if (passwordForm.password !== passwordForm.password2) {
      alert('Le password non coincidono.')
      return
    }
    passwordMutation.mutate({ student: selectedStudent, newPassword: passwordForm.password })
  }

  const details = detailsQuery.data || { enrollments: [], payments: [] }
  const canResetSelectedPassword = Boolean(selectedStudent?.auth_user_id || selectedStudent?.email)
  const configStatus = getOrchideaConfigStatus()
  const isLegacySource = students.sourceTable === 'tesserati'
  const sourceLabel = students.sourceLabel || (isLegacySource ? 'Nova legacy' : 'Orchidea Allievi')
  const hasOrchideaAuthProblem = configStatus.mode === 'dedicated' && authStatus && !authStatus.authenticated
  const sourceAlertClass = isLegacySource || hasOrchideaAuthProblem || orchideaAuthWarning
    ? 'nova-source-alert nova-source-alert--warn'
    : 'nova-source-alert nova-source-alert--ok'
  const sourceMessage = isLegacySource
    ? configStatus.message
    : hasOrchideaAuthProblem
      ? 'Database configurato, ma manca la sessione sul portale allievi: fai logout e rientra con l’account admin di orchidea-allievi.'
      : authStatus?.authenticated
        ? `Sessione allievi attiva${authStatus.email ? ` con ${authStatus.email}` : ''}.`
        : configStatus.message

  return (
    <section className="page">
      <div className="dashboard-hero tesserati-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Tesserati Orchidea</div>
          <h2 className="dashboard-hero__title">Archivio tesserati corretto</h2>
          <p className="dashboard-hero__text">
            Questa sezione legge la tabella ufficiale <strong>tesseramenti</strong> usata dal sito e da orchidea-allievi, senza creare doppioni.
          </p>
        </div>
      </div>

      <div className={sourceAlertClass}>
        <strong>Sorgente dati:</strong> {sourceLabel}. {sourceMessage}
        {orchideaAuthWarning ? <span className="source-alert-detail"> {orchideaAuthWarning}</span> : null}
      </div>

      <div className="stats-grid">
        <div className="page-card tesserati-stat-card">
          <span>Totale tesserati</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="page-card tesserati-stat-card">
          <span>Tessere attive</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="page-card tesserati-stat-card">
          <span>Corsisti</span>
          <strong>{stats.corsisti}</strong>
        </div>
        <div className="page-card tesserati-stat-card">
          <span>Senza numero progressivo</span>
          <strong>{stats.missingNumbers}</strong>
        </div>
      </div>

      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Tesserati</h2>
            <p>Anagrafiche sincronizzate con orchidea-allievi e portale tesserati.</p>
          </div>

          {isAdmin ? (
            <button
              className="topbar__button topbar__button--primary"
              type="button"
              onClick={() => generateMissingMutation.mutate()}
              disabled={generateMissingMutation.isPending || stats.missingNumbers === 0}
            >
              {generateMissingMutation.isPending ? 'Genero numeri…' : 'Genera numeri mancanti'}
            </button>
          ) : null}
        </div>

        <div className="toolbar toolbar--wrap tesserati-toolbar">
          <input
            className="searchInput"
            type="text"
            placeholder="Cerca nome, cognome, email, codice fiscale, telefono o tessera"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select className="filterSelect" value={stagione} onChange={(e) => setStagione(e.target.value)}>
            <option value="">Tutte le stagioni</option>
            {stagioniDisponibili.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <select className="filterSelect" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="pending_payment">In attesa pagamento</option>
            <option value="active">Attiva</option>
            <option value="inactive">Non attiva</option>
            <option value="blocked">Bloccata</option>
          </select>

          <select className="filterSelect" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Tutti i ruoli</option>
            <option value="corsista">Solo corsisti</option>
            <option value="tesserato">Solo tesserati</option>
            <option value="attiva">Tessera attiva</option>
            <option value="non_attiva">Tessera non attiva</option>
          </select>
        </div>

        {isLoading ? <p>Caricamento tesserati...</p> : null}
        {error ? <p className="form-error">Errore: {error.message}</p> : null}
        {updateMutation.error ? <p className="form-error">Errore salvataggio: {updateMutation.error.message}</p> : null}
        {generateNumberMutation.error ? <p className="form-error">Errore numero tessera: {generateNumberMutation.error.message}</p> : null}
        {generateMissingMutation.error ? <p className="form-error">Errore numeri mancanti: {generateMissingMutation.error.message}</p> : null}
        {toggleCorsistaMutation.error ? <p className="form-error">Errore ruolo corsista: {toggleCorsistaMutation.error.message}</p> : null}

        {!isLoading && !error ? (
          <>
            <div className="student-list-toolbar">
              <div>
                <strong>{filteredStudents.length} tesserati trovati</strong>
                <small>Fonte dati: {sourceLabel}</small>
              </div>
            </div>

            <div className="tableWrap">
              <table className="dataTable tesserati-table">
                <thead>
                  <tr>
                    <th>Allievo</th>
                    <th>Email</th>
                    <th>Telefono</th>
                    <th>Cod. fiscale</th>
                    <th>Tessera</th>
                    <th>Stato</th>
                    <th>Ruolo</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan="8">Nessun tesserato trovato.</td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => (
                      <tr key={student.id} className={selectedStudent?.id === student.id ? 'selected-table-row' : ''}>
                        <td>
                          <div className="tesserati-person-cell">
                            <span className="tesserati-avatar">{initials(student)}</span>
                            <div>
                              <strong>{fullName(student)}</strong>
                              <small>{student.stagione || 'Stagione non indicata'}</small>
                            </div>
                          </div>
                        </td>
                        <td>{student.email || '—'}</td>
                        <td>{student.telefono || '—'}</td>
                        <td>{student.cf || '—'}</td>
                        <td>
                          <span className={student.tessera_attiva !== false ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--warn'}>
                            {student.tessera_attiva !== false ? 'Attiva' : 'Non attiva'}
                          </span>
                          <small className="table-subtext">{membershipCode(student) || 'Senza numero'}</small>
                        </td>
                        <td>
                          <span className={statusClass(student.status)}>{statusLabel(student.status)}</span>
                          <small className="table-subtext">{paymentStatusLabel(student.payment_status)}</small>
                        </td>
                        <td>
                          <span className={student.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>
                            {student.is_corsista ? 'Corsista' : 'Tesserato'}
                          </span>
                        </td>
                        <td>
                          <div className="rowActions">
                            <button className="actionBtn" type="button" onClick={() => openStudentDetail(student)}>
                              Apri scheda
                            </button>
                            {isAdmin && !hasCustomMembershipNumber(student) ? (
                              <button
                                className="actionBtn"
                                type="button"
                                onClick={() => generateNumberMutation.mutate(student)}
                                disabled={generateNumberMutation.isPending}
                              >
                                N. progr.
                              </button>
                            ) : null}
                            {canEditStudent ? (
                              <button
                                className="actionBtn"
                                type="button"
                                onClick={() => toggleCorsistaMutation.mutate(student)}
                                disabled={toggleCorsistaMutation.isPending}
                              >
                                {student.is_corsista ? 'Rimuovi corsista' : 'Corsista'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      {selectedStudent ? (
        <div className="modalOverlay" onClick={closeStudentDetail}>
          <div className="modalCard tesserati-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="student-profile-hero">
              <div className="student-profile-identity">
                <span className="student-profile-avatar">{initials(selectedStudent)}</span>
                <div>
                  <div className="dashboard-hero__eyebrow">Scheda allievo</div>
                  <h3>{fullName(selectedStudent)}</h3>
                  <p>Profilo completo, tessera, corsi collegati e strumenti admin in un’unica vista.</p>
                  <div className="student-profile-chips">
                    <span className={selectedStudent.tessera_attiva !== false ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--warn'}>
                      {selectedStudent.tessera_attiva !== false ? 'Tessera attiva' : 'Tessera non attiva'}
                    </span>
                    <span className={selectedStudent.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>
                      {selectedStudent.is_corsista ? 'Corsista' : 'Tesserato'}
                    </span>
                    <span className="nova-pill nova-pill--neutral">{membershipCode(selectedStudent) || 'Senza numero'}</span>
                  </div>
                </div>
              </div>
              <button className="student-profile-close" type="button" onClick={closeStudentDetail}>Chiudi</button>
            </div>

            <form className="formGrid tesserati-detail-form student-editor-card" onSubmit={handleSubmit}>
              <div className="student-form-title">
                <div>
                  <h3>Anagrafica e tessera</h3>
                  <p>{canEditStudent ? 'Puoi modificare i dati anagrafici e operativi consentiti.' : 'Vista sola lettura: le modifiche sono riservate agli operatori autorizzati.'}</p>
                </div>
                <span className={isAdmin ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{isAdmin ? 'Admin attivo' : canEditStudent ? 'Operatore attivo' : 'Sola lettura'}</span>
              </div>
              <label>Nome
                <input value={studentForm.nome} onChange={(e) => handleChange('nome', e.target.value)} disabled={!canEditStudent} required />
              </label>
              <label>Cognome
                <input value={studentForm.cognome} onChange={(e) => handleChange('cognome', e.target.value)} disabled={!canEditStudent} required />
              </label>
              <label>Email
                <input type="email" value={studentForm.email} onChange={(e) => handleChange('email', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Telefono
                <input value={studentForm.telefono} onChange={(e) => handleChange('telefono', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Codice fiscale
                <input value={studentForm.cf} onChange={(e) => handleChange('cf', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Data nascita
                <input type="date" value={studentForm.nascita || ''} onChange={(e) => handleChange('nascita', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Luogo nascita
                <input value={studentForm.luogo} onChange={(e) => handleChange('luogo', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Residenza
                <input value={studentForm.residenza} onChange={(e) => handleChange('residenza', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Numero tessera personalizzato
                <input value={studentForm.numero_tessera} onChange={(e) => handleChange('numero_tessera', e.target.value)} disabled={!canEditStudent} placeholder="Lascia vuoto per usare il codice TESS" />
              </label>
              <label>Stagione
                <input value={studentForm.stagione} onChange={(e) => handleChange('stagione', e.target.value)} disabled={!canEditStudent} />
              </label>
              <label>Stato tessera
                <select value={studentForm.status || ''} onChange={(e) => handleChange('status', e.target.value)} disabled={!canEditStudent}>
                  <option value="pending_payment">In attesa pagamento</option>
                  <option value="active">Attiva</option>
                  <option value="inactive">Non attiva</option>
                  <option value="blocked">Bloccata</option>
                </select>
              </label>
              <label>Stato pagamento tessera
                <select value={studentForm.payment_status || ''} onChange={(e) => handleChange('payment_status', e.target.value)} disabled={!canEditStudent}>
                  <option value="unpaid">Non pagato</option>
                  <option value="paid">Pagato</option>
                  <option value="pending">In attesa</option>
                  <option value="refunded">Rimborsato</option>
                </select>
              </label>

              <div className="tesserati-check-grid">
                <label className="check-card">
                  <input type="checkbox" checked={studentForm.tessera_attiva} onChange={(e) => handleChange('tessera_attiva', e.target.checked)} disabled={!canEditStudent} />
                  Tessera attiva
                </label>
                <label className="check-card">
                  <input type="checkbox" checked={studentForm.is_corsista} onChange={(e) => handleChange('is_corsista', e.target.checked)} disabled={!canEditStudent} />
                  Corsista
                </label>
              </div>

              {!studentForm.numero_tessera ? (
                <div className="info-box compact-info">
                  <strong>Codice tessera attuale: {membershipCode(selectedStudent) || '—'}</strong>
                  <span>È lo stesso criterio di orchidea-allievi: numero progressivo se presente, altrimenti codice TESS basato sull’ID.</span>
                </div>
              ) : null}

              <div className="modalActions">
                {canEditStudent ? (
                  <button type="submit" className="topbar__button topbar__button--primary" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Salvataggio…' : 'Salva scheda allievo'}
                  </button>
                ) : null}
                {isAdmin && !hasCustomMembershipNumber(selectedStudent) ? (
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => generateNumberMutation.mutate(selectedStudent)}
                    disabled={generateNumberMutation.isPending}
                  >
                    {generateNumberMutation.isPending ? 'Genero…' : 'Genera numero progressivo'}
                  </button>
                ) : null}
              </div>
            </form>

            {isAdmin ? (
              <div className="page-card tesserati-password-card">
                <div className="section-head section-head--compact">
                  <div>
                    <h3>Reset password allievo</h3>
                    <p>Disponibile solo admin. Se manca auth_user_id, Nova prova a collegare l’allievo tramite email.</p>
                  </div>
                  <span className={canResetSelectedPassword ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--warn'}>
                    {selectedStudent.auth_user_id ? 'Auth collegato' : selectedStudent.email ? 'Reset via email' : 'Auth mancante'}
                  </span>
                </div>
                <div className="formGrid">
                  <label>Nuova password
                    <input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} disabled={!canResetSelectedPassword} />
                  </label>
                  <label>Ripeti password
                    <input type="password" value={passwordForm.password2} onChange={(e) => setPasswordForm({ ...passwordForm, password2: e.target.value })} disabled={!canResetSelectedPassword} />
                  </label>
                </div>
                {passwordMutation.error ? <p className="form-error">{passwordMutation.error.message}</p> : null}
                {passwordMutation.isSuccess ? <p className="success-text">Password aggiornata correttamente.</p> : null}
                <button type="button" className="topbar__button tesserati-password-button" onClick={handlePasswordChange} disabled={!canResetSelectedPassword || passwordMutation.isPending}>
                  {passwordMutation.isPending ? 'Aggiorno…' : 'Aggiorna password allievo'}
                </button>
              </div>
            ) : null}

            <div className="tesserati-detail-grid">
              <div className="page-card tesserati-nested-card">
                <div className="section-head section-head--compact">
                  <div>
                    <h3>Iscrizioni e prezzi</h3>
                    <p>Corsi collegati alla scheda allievo.</p>
                  </div>
                  <span className="nova-pill nova-pill--neutral">{details.enrollments.length}</span>
                </div>

                {detailsQuery.isLoading ? <p>Caricamento corsi...</p> : null}
                {details.enrollments.length === 0 && !detailsQuery.isLoading ? <p>Nessun corso collegato.</p> : null}

                <div className="tesserati-mini-list">
                  {details.enrollments.map((item) => (
                    <div className="tesserati-mini-row" key={item.id}>
                      <div>
                        <strong>{item.corsi?.nome || 'Corso'}</strong>
                        <small>
                          {item.corsi?.livello || 'Livello non impostato'} · {billingLabel(item.tipo_pagamento)} · {formatMoney(item.tariffa_mensile ?? item.corsi?.prezzo_mensile)} / mese
                        </small>
                        {item.corsi?.giorno_settimana ? (
                          <small>{item.corsi.giorno_settimana} {formatTime(item.corsi.ora_inizio)}-{formatTime(item.corsi.ora_fine)}</small>
                        ) : null}
                        {item.pacchetto_nome ? <small>Pacchetto: {item.pacchetto_nome}</small> : null}
                      </div>
                      <span className={item.stato === 'attivo' ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{item.stato || 'attivo'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="page-card tesserati-nested-card">
                <div className="section-head section-head--compact">
                  <div>
                    <h3>Pagamenti</h3>
                    <p>Ultime quote collegate.</p>
                  </div>
                  <span className="nova-pill nova-pill--neutral">{details.payments.length}</span>
                </div>

                {detailsQuery.isLoading ? <p>Caricamento pagamenti...</p> : null}
                {details.payments.length === 0 && !detailsQuery.isLoading ? <p>Nessun pagamento creato.</p> : null}

                <div className="tesserati-mini-list">
                  {details.payments.map((payment) => (
                    <div className="tesserati-mini-row" key={payment.id}>
                      <div>
                        <strong>{payment.descrizione || 'Pagamento'}</strong>
                        <small>{payment.periodo || 'Periodo non indicato'} · scadenza {formatDate(payment.scadenza)}</small>
                      </div>
                      <div className="tesserati-payment-side">
                        <strong>{formatMoney(payment.importo)}</strong>
                        <span className={statusClass(payment.stato)}>{paymentStatusLabel(payment.stato)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {detailsQuery.error ? <p className="form-error">Errore scheda: {detailsQuery.error.message}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
