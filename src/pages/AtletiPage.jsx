import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, BookOpenCheck, CheckCircle2, IdCard, Mail, Phone, Plus, Search, ShieldCheck, Sparkles, Trash2, UserCheck } from 'lucide-react'
import { useAuth } from '../context/authContext'
import { addCourseParticipant, fetchOrchideaCourses, fetchOrchideaStudents, removeCourseParticipant, updateTesserato } from '../api/orchideaEntities'
import { fetchTesseratoDetails } from '../api/tesserati'
import { fetchPackagesCatalog } from '../api/packagesCatalog'
import { COURSE_MEMBERSHIP_FEE, EVENT_MEMBERSHIP_FEE, fetchMembershipFeeRecords, markConvertedCorsistaMembership, resolveMembershipFeeState, setMembershipFeePaidAmount } from '../api/membershipFees'
import { resolveCoursePricing } from '../lib/coursePriceList'
import { enrollmentIsActiveForMonth } from '../lib/packagePricing'
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

function firstMembershipChargeMonth(enrollments = [], currentMonth) {
  const months = (Array.isArray(enrollments) ? enrollments : [])
    .map((row) => row.data_inizio || row.data_iscrizione || row.created_at || '')
    .map((value) => String(value || '').slice(0, 7))
    .filter((value) => /^\d{4}-\d{2}$/.test(value) && value >= currentMonth)
    .sort()
  return months[0] || currentMonth
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

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
  })

  const coursesQuery = useQuery({
    queryKey: ['orchidea-courses-for-atleti'],
    queryFn: fetchOrchideaCourses,
  })

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-catalog', { activeOnly: true }],
    queryFn: () => fetchPackagesCatalog({ includeInactive: false }),
  })

  const membershipFeesQuery = useQuery({
    queryKey: ['nova-membership-fees'],
    queryFn: fetchMembershipFeeRecords,
  })

  const detailsQuery = useQuery({
    queryKey: ['atleta-details-courses', selected?.id],
    queryFn: () => fetchTesseratoDetails(selected.id),
    enabled: !!selected?.id,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTesserato(id, payload),
    onSuccess: (updated) => {
      if (selected?.id === updated?.id) setSelected((current) => current ? { ...current, ...updated, raw: updated } : current)
      queryClient.invalidateQueries({ queryKey: ['orchidea-atleti-corsisti'] })
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
    },
  })

  const membershipFeeMutation = useMutation({
    mutationFn: setMembershipFeePaidAmount,
    onSuccess: (updated) => {
      queryClient.setQueryData(['nova-membership-fees'], (current = []) => {
        const rows = Array.isArray(current) ? current : []
        const exists = rows.some((item) => String(item.tesseramento_id) === String(updated.tesseramento_id))
        return exists
          ? rows.map((item) => String(item.tesseramento_id) === String(updated.tesseramento_id) ? updated : item)
          : [...rows, updated]
      })
      queryClient.invalidateQueries({ queryKey: ['nova-membership-fees'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
    },
  })

  const addCourseMutation = useMutation({
    mutationFn: addCourseParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atleta-details-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-courses'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      setSelectedCourseId('')
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

  const rows = useMemo(() => studentsQuery.data || [], [studentsQuery.data])
  const courses = coursesQuery.data || []
  const details = detailsQuery.data || { enrollments: [], payments: [] }
  const currentMonth = new Date().toISOString().slice(0, 7)
  const activeEnrollments = (details.enrollments || []).filter((item) => enrollmentIsActiveForMonth(item, currentMonth))
  const membershipChargeMonth = firstMembershipChargeMonth(details.enrollments || [], currentMonth)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyCorsisti && !row.is_corsista) return false
      if (!term) return true
      return [fullName(row), row.email, row.telefono, row.cf, row.numero_tessera]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [rows, search, onlyCorsisti])

  const assignedCourseIds = new Set(activeEnrollments.map((item) => String(item.corso_id)))
  const availableCourses = courses.filter((course) => !assignedCourseIds.has(String(course.id)))
  const assignedCourses = activeEnrollments.map((item) => ({
    ...(courses.find((course) => String(course.id) === String(item.corso_id)) || {}),
    ...(item.corsi || {}),
  })).filter((course) => course.id || course.nome)
  const recommendedMonthly = resolveCoursePricing(assignedCourses, packagesQuery.data || [], 'mensile')
  const membershipFeeMap = new Map((membershipFeesQuery.data || []).map((item) => [String(item.tesseramento_id), item]))
  const selectedMembershipFee = selected ? resolveMembershipFeeState(selected, membershipFeeMap.get(String(selected.id))) : null
  const selectedMembershipChoice = selectedMembershipFee?.status === 'paid'
    ? 'paid'
    : Number(selectedMembershipFee?.paid_amount || 0) === EVENT_MEMBERSHIP_FEE
      ? 'event'
      : 'unpaid'

  async function toggleCorsista(row) {
    if (!canEdit) return
    if (!row.is_corsista) {
      try {
        await markConvertedCorsistaMembership(row)
        queryClient.invalidateQueries({ queryKey: ['nova-membership-fees'] })
      } catch (error) {
        console.warn('Quota tessera assicurativa non inizializzata:', error)
      }
    }
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
      tariffaMensile: null,
    })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Corsisti</div>
          <h2 className="dashboard-hero__title">Archivio corsisti da Orchidea Allievi</h2>
          <p className="dashboard-hero__text">Cerca i corsisti, gestisci il ruolo corsista e assegna uno o più corsi direttamente dalla scheda atleta.</p>
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
            <h2>Corsisti</h2>
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
            <thead><tr><th>Atleta</th><th>Email</th><th>Telefono</th><th>Cod. fiscale</th><th>Tessera</th><th>Ruolo</th><th>Tessera corsista</th><th>Azioni</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="8">Nessun atleta trovato.</td></tr> : filtered.map((row) => {
                const feeState = resolveMembershipFeeState(row, membershipFeeMap.get(String(row.id)))
                return <tr key={row.id}>
                  <td><div className="tesserati-person-cell"><span className="tesserati-avatar">{initials(row)}</span><div><strong>{fullName(row)}</strong><small>{row.stagione || 'Stagione non indicata'}</small></div></div></td>
                  <td>{row.email || '—'}</td>
                  <td>{row.telefono || '—'}</td>
                  <td>{row.cf || '—'}</td>
                  <td>{row.numero_tessera || '—'}</td>
                  <td><span className={row.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{row.is_corsista ? 'Corsista' : 'Tesserato'}</span></td>
                  <td>{row.is_corsista ? <span className={`atleti-membership-pill is-${feeState.status}`}>{feeState.status === 'paid' ? 'Pagata €25' : feeState.status === 'partial' ? (Number(feeState.paid_amount) === EVENT_MEMBERSHIP_FEE ? 'Serata €3 · +€22' : `Parziale €${feeState.paid_amount} · +€${feeState.remaining}`) : 'Da pagare €25'}</span> : <span className="nova-pill nova-pill--neutral">—</span>}</td>
                  <td><div className="rowActions"><button className="actionBtn atleti-action-course" onClick={() => setSelected(row)}>Scheda corsi</button>{canEdit ? <button className={`actionBtn atleti-action-role ${row.is_corsista ? 'is-remove' : 'is-add'}`} onClick={() => toggleCorsista(row)}>{row.is_corsista ? 'Rimuovi corsista' : 'Rendi corsista'}</button> : null}</div></td>
                </tr>
              })}
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
                    <span className="nova-pill nova-pill--neutral">{activeEnrollments.length} corsi collegati</span>
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
                <span>Listino automatico</span>
                <strong>{recommendedMonthly ? money(recommendedMonthly.prezzo) : money(0)}</strong>
                <p>{recommendedMonthly ? recommendedMonthly.pricing_group_label : 'Assegna almeno un corso per calcolare il pacchetto.'}</p>
                {recommendedMonthly ? <small>{recommendedMonthly.nome}</small> : null}
              </div>
            </div>

            {selectedMembershipFee ? <div className={`atleti-membership-card is-${selectedMembershipFee.status}`}>
              <div className="atleti-membership-card__icon"><ShieldCheck size={25} /></div>
              <div className="atleti-membership-card__copy">
                <div className="dashboard-hero__eyebrow">Tessera assicurativa corsista</div>
                <h3>{selectedMembershipFee.status === 'paid' ? 'Pagamento completo' : selectedMembershipFee.status === 'partial' ? 'Differenza da incassare' : 'Pagamento da incassare'}</h3>
                <p>Quota corsista {money(COURSE_MEMBERSHIP_FEE)}. Il tesseramento serata vale {money(EVENT_MEMBERSHIP_FEE)}: se era già stato pagato resta solo la differenza di {money(COURSE_MEMBERSHIP_FEE - EVENT_MEMBERSHIP_FEE)}.</p>
              </div>
              <div className="atleti-membership-card__amount">
                <span>Pagato</span><strong>{money(selectedMembershipFee.paid_amount)}</strong>
                <small>{selectedMembershipFee.remaining > 0 ? `Residuo ${money(selectedMembershipFee.remaining)}` : 'Saldo completo'}</small>
              </div>
              {canEdit ? <div className="atleti-membership-actions">
                <button
                  type="button"
                  aria-pressed={selectedMembershipChoice === 'unpaid'}
                  disabled={membershipFeeMutation.isPending}
                  className={`atleti-membership-action is-unpaid ${selectedMembershipChoice === 'unpaid' ? 'is-selected' : ''}`}
                  onClick={() => membershipFeeMutation.mutate({ studentId: selected.id, paidAmount: 0, source: 'segreteria' })}
                >
                  {selectedMembershipChoice === 'unpaid' ? <CheckCircle2 size={15} /> : null} Non pagata
                </button>
                <button
                  type="button"
                  aria-pressed={selectedMembershipChoice === 'event'}
                  disabled={membershipFeeMutation.isPending}
                  className={`atleti-membership-action is-event ${selectedMembershipChoice === 'event' ? 'is-selected' : ''}`}
                  onClick={() => membershipFeeMutation.mutate({ studentId: selected.id, paidAmount: EVENT_MEMBERSHIP_FEE, source: 'tesseramento_serata' })}
                >
                  {selectedMembershipChoice === 'event' ? <CheckCircle2 size={15} /> : null} Serata €3 pagata
                </button>
                <button
                  type="button"
                  aria-pressed={selectedMembershipChoice === 'paid'}
                  disabled={membershipFeeMutation.isPending}
                  className={`atleti-membership-action is-paid ${selectedMembershipChoice === 'paid' ? 'is-selected' : ''}`}
                  onClick={() => membershipFeeMutation.mutate({ studentId: selected.id, paidAmount: COURSE_MEMBERSHIP_FEE, source: 'quota_corsista', chargedMonth: membershipChargeMonth })}
                >
                  {selectedMembershipChoice === 'paid' ? <CheckCircle2 size={15} /> : null} Corsista €25 pagata
                </button>
                <small className="atleti-membership-selection-note">Selezione attiva: <strong>{selectedMembershipChoice === 'paid' ? 'Corsista €25 pagata' : selectedMembershipChoice === 'event' ? 'Serata €3 pagata' : 'Non pagata'}</strong></small>
              </div> : null}
              {membershipFeeMutation.error ? <p className="form-error atleti-membership-error">{membershipFeeMutation.error.message}</p> : null}
            </div> : null}

            <div className="atleti-assignment-card">
              <div className="atleti-assignment-head">
                <div>
                  <div className="dashboard-hero__eyebrow">Assegnazione corsi</div>
                  <h3>Collega un nuovo corso</h3>
                  <p>Seleziona i corsi: Nova applica automaticamente il listino corretto in Pagamenti. L’importo resta comunque modificabile al momento dell’incasso.</p>
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
                  <div className="atleti-auto-price-hint">
                    <Sparkles size={18} />
                    <div><strong>Prezzo automatico</strong><small>1 corso, Country, combinazione Bachata + Salsa, 2 corsi Special, 3 corsi o All You Can Dance.</small></div>
                  </div>
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
                  <p>Riepilogo corsi inclusi nel pacchetto del corsista.</p>
                </div>
                <span className="nova-pill nova-pill--neutral">{activeEnrollments.length} totali</span>
              </div>

              {detailsQuery.isLoading ? <p>Caricamento corsi collegati…</p> : null}
              {activeEnrollments.length === 0 && !detailsQuery.isLoading ? (
                <div className="atleti-empty-courses">
                  <BookOpenCheck size={28} />
                  <strong>Nessun corso collegato</strong>
                  <p>Seleziona un corso dal box sopra per creare il pacchetto del corsista.</p>
                </div>
              ) : null}

              <div className="atleti-linked-course-list">
                {activeEnrollments.map((item) => (
                  <div className="atleti-linked-course-row" key={item.id}>
                    <div className="atleti-linked-course-main">
                      <span className="atleti-linked-course-dot" />
                      <div>
                        <strong>{item.corsi?.nome || 'Corso'}</strong>
                        <small>{item.corsi?.livello || 'Livello non impostato'} · incluso nel pacchetto calcolato automaticamente</small>
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
