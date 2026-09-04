import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { BookOpenCheck, Euro, PackageCheck, Save, Search, Sparkles, Trash2, UserRoundCheck, X } from 'lucide-react'
import { fetchAllieviPaymentsMonth, euro } from '../api/orchideaPayments'
import { addCourseParticipant, fetchOrchideaCourses, fetchStudentPackageDetails, removeCourseParticipant, saveStudentPackage } from '../api/orchideaEntities'
import { distributeTotalByOriginalPrice } from '../lib/packagePricing'
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


function enrollmentAmount(row) {
  return Math.max(0, numeric(row.quota_allievo_mensile ?? row.tariffa_mensile ?? row.corsi?.prezzo_mensile))
}

function redistributeRows(rows, totalValue) {
  const distributed = distributeTotalByOriginalPrice(rows, totalValue)
  return distributed.map((row) => {
    if (row.percentuale_insegnante === '' || row.percentuale_insegnante === null || row.percentuale_insegnante === undefined) return row
    return {
      ...row,
      quota_insegnante_mensile: (numeric(row.quota_allievo_mensile) * numeric(row.percentuale_insegnante) / 100).toFixed(2),
    }
  })
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
    quota_insegnante_mensile: row.quota_insegnante_mensile === null || row.quota_insegnante_mensile === undefined || row.quota_insegnante_mensile === '' ? '' : numeric(row.quota_insegnante_mensile).toFixed(2),
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

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-overview', { month, search }],
    queryFn: () => fetchAllieviPaymentsMonth({ month, search, courseId: 'all', status: 'all' }),
  })

  const detailsQuery = useQuery({
    queryKey: ['nova-package-details', selected?.tesseramento_id, month],
    queryFn: () => fetchStudentPackageDetails(selected.tesseramento_id, { month }),
    enabled: !!selected?.tesseramento_id,
  })

  const coursesQuery = useQuery({
    queryKey: ['nova-package-courses-list'],
    queryFn: fetchOrchideaCourses,
    enabled: !!selected,
  })

  const packages = packagesQuery.data || []
  const enrollments = detailsQuery.data?.enrollments
  const allCourses = coursesQuery.data || []


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
    mutationFn: async (payload) => ({
      enrollment: await addCourseParticipant(payload),
      payload,
    }),
    onSuccess: async ({ enrollment, payload }) => {
      const course = allCourses.find((item) => String(item.id) === String(payload.courseId)) || {}
      if (enrollment?.id) {
        const newRow = prepareEnrollment({
          ...enrollment,
          corso_id: payload.courseId,
          quota_allievo_mensile: payload.tariffaMensile,
          tariffa_mensile: payload.tariffaMensile,
          corsi: course,
        })
        const targetTotal = packageTotal === ''
          ? [...rowsForm, newRow].reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)
          : Math.max(0, numeric(packageTotal))
        const nextRows = redistributeRows([...rowsForm, newRow], targetTotal)
        setRowsForm(nextRows)
        await saveMutation.mutateAsync({
          studentId: selected?.tesseramento_id,
          effectiveMonth: month,
          packageName,
          packageTotal: targetTotal,
          note,
          rows: nextRows,
        })
      }
      queryClient.invalidateQueries({ queryKey: ['nova-package-details'] })
      queryClient.invalidateQueries({ queryKey: ['nova-packages-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      setCourseToAdd('')
    },
  })

  const removeCourseMutation = useMutation({
    mutationFn: ({ enrollmentId, effectiveMonth }) => removeCourseParticipant(enrollmentId, { effectiveMonth }),
    onSuccess: async (_closedEnrollment, variables) => {
      const remainingRows = rowsForm.filter((row) => String(row.id) !== String(variables.enrollmentId))
      if (remainingRows.length > 0) {
        const targetTotal = packageTotal === ''
          ? remainingRows.reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)
          : Math.max(0, numeric(packageTotal))
        const nextRows = redistributeRows(remainingRows, targetTotal)
        setRowsForm(nextRows)
        await saveMutation.mutateAsync({
          studentId: selected?.tesseramento_id,
          effectiveMonth: month,
          packageName,
          packageTotal: targetTotal,
          note,
          rows: nextRows,
        })
      } else {
        setRowsForm([])
        setPackageTotal('0.00')
      }
      queryClient.invalidateQueries({ queryKey: ['nova-package-details'] })
      queryClient.invalidateQueries({ queryKey: ['nova-packages-overview'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-allievi-payments'] })
      queryClient.invalidateQueries({ queryKey: ['orchidea-teacher-payouts'] })
    },
  })

  useEffect(() => {
    // Non inizializzare il form finché la query è ancora in caricamento:
    // un array di fallback creato a ogni render causava un ciclo infinito di setState.
    if (!selected?.tesseramento_id || detailsQuery.isLoading || !enrollments) return

    if (enrollments.length === 0) {
      setRowsForm([])
      setPackageName('Pacchetto mensile')
      setPackageTotal('')
      setNote('')
      return
    }

    const first = enrollments[0]
    const packageSource = enrollments.find((item) => item.pacchetto_totale_mensile !== null && item.pacchetto_totale_mensile !== undefined && item.pacchetto_totale_mensile !== '') || first
    const prepared = enrollments.map(prepareEnrollment)
    const calculatedTotal = prepared.reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)
    const storedTotal = packageSource.pacchetto_totale_mensile !== null && packageSource.pacchetto_totale_mensile !== undefined && packageSource.pacchetto_totale_mensile !== ''
      ? numeric(packageSource.pacchetto_totale_mensile)
      : calculatedTotal
    const normalizedRows = Math.abs(calculatedTotal - storedTotal) > 0.009
      ? redistributeRows(prepared, storedTotal)
      : prepared

    setPackageName(packageSource.pacchetto_nome || (enrollments.length > 1 ? 'Pacchetto multicorso' : 'Corso singolo'))
    setPackageTotal(storedTotal || storedTotal === 0 ? storedTotal.toFixed(2) : '')
    setNote(packageSource.note_pacchetto || '')
    setRowsForm(normalizedRows)
  }, [selected?.tesseramento_id, detailsQuery.isLoading, enrollments])

  useEffect(() => {
    if (!selected) {
      setRowsForm([])
      setCourseToAdd('')
    }
  }, [selected])

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
  const packageEditorTotal = rowsForm.reduce((sum, row) => sum + numeric(row.quota_allievo_mensile), 0)
  const originalCoursesTotal = rowsForm.reduce((sum, row) => sum + numeric(row.prezzo_corso), 0)

  function handlePackageTotalChange(value) {
    setPackageTotal(value)
    if (value === '') return
    setRowsForm((prev) => redistributeRows(prev, Math.max(0, numeric(value))))
  }

  function addCourse(e) {
    e.preventDefault()
    if (!selected?.tesseramento_id || !courseToAdd) return
    const course = allCourses.find((item) => String(item.id) === String(courseToAdd))
    addCourseMutation.mutate({
      courseId: courseToAdd,
      studentId: selected.tesseramento_id,
      tariffaMensile: Math.max(0, numeric(course?.prezzo_mensile)),
      effectiveMonth: month,
    })
  }

  function submit(e) {
    e.preventDefault()
    if (!selected?.tesseramento_id) return
    saveMutation.mutate({
      studentId: selected.tesseramento_id,
      effectiveMonth: month,
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
          <h2 className="dashboard-hero__title">Pacchetti e quote mensili</h2>
          <p className="dashboard-hero__text">Imposta il totale del pacchetto: Nova ripartisce automaticamente la quota tra i corsi. Ogni modifica vale dal mese selezionato e non altera i mesi già pagati.</p>
        </div>
      </div>

      <div className="packages-summary-grid">
        <div className="page-card packages-summary-card"><UserRoundCheck /><span>Allievi con corsi</span><strong>{summary.students}</strong></div>
        <div className="page-card packages-summary-card"><PackageCheck /><span>Corsi collegati</span><strong>{summary.courses}</strong></div>
        <div className="page-card packages-summary-card"><Euro /><span>Quote mensili</span><strong>{euro(summary.monthly)}</strong></div>
      </div>

      <div className="page-card packages-toolbar">
        <label>Mese di competenza
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
                <p>Le modifiche valgono da {monthLabel(month)}. La ripartizione tra i corsi viene aggiornata automaticamente senza modificare i mesi precedenti.</p>
              </div>
              <button className="package-editor-close" type="button" onClick={() => setSelected(null)} aria-label="Chiudi finestra"><X size={20} /></button>
            </div>

            <form className="package-editor-body" onSubmit={submit}>
              <div className="package-editor-settings">
                <label>Nome pacchetto
                  <input value={packageName} onChange={(e) => setPackageName(e.target.value)} />
                </label>
                <label>Totale pacchetto mensile
                  <input type="number" step="0.01" min="0" value={packageTotal} onChange={(e) => handlePackageTotalChange(e.target.value)} placeholder="Es. 100" />
                  <small className="package-competence-hint">Valido da {monthLabel(month)}</small>
                </label>
                <label>Note interne
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. promo, sconto fratelli…" />
                </label>
              </div>

              <div className="package-add-course-card">
                <div>
                  <div className="dashboard-hero__eyebrow">Corsi nel pacchetto</div>
                  <h4>Aggiungi un corso all’allievo</h4>
                  <p>Seleziona il corso: Nova ricalcola subito la ripartizione del pacchetto in base ai prezzi originali.</p>
                </div>
                <div className="package-add-course-form">
                  <select value={courseToAdd} onChange={(e) => setCourseToAdd(e.target.value)}>
                    <option value="">Seleziona corso da aggiungere</option>
                    {availableCourses.map((course) => (
                      <option value={course.id} key={course.id}>{course.nome}{course.livello ? ` · ${course.livello}` : ''} · {euro(course.prezzo_mensile)}</option>
                    ))}
                  </select>
                  <button type="button" className="package-add-course-button" disabled={!courseToAdd || addCourseMutation.isPending} onClick={addCourse}>
                    {addCourseMutation.isPending ? 'Aggiungo…' : 'Aggiungi +'}
                  </button>
                </div>
              </div>

              <div className="package-editor-totals">
                <span><strong>{euro(packageEditorTotal)}</strong><small>Totale quota allievo</small></span>
                <span><strong>{euro(originalCoursesTotal)}</strong><small>Somma prezzi originali</small></span>
                <span><strong>{rowsForm.length}</strong><small>Corsi nel pacchetto</small></span>
              </div>

              {detailsQuery.isLoading ? <p>Caricamento corsi collegati…</p> : null}
              {detailsQuery.error ? <p className="form-error">Errore corsi collegati: {detailsQuery.error.message}</p> : null}
              {coursesQuery.error ? <p className="form-error">Errore lista corsi: {coursesQuery.error.message}</p> : null}
              {addCourseMutation.error ? <p className="form-error">Errore aggiunta corso: {addCourseMutation.error.message}</p> : null}
              {removeCourseMutation.error ? <p className="form-error">Errore rimozione corso: {removeCourseMutation.error.message}</p> : null}

              <div className="package-course-editor-list">
                {rowsForm.map((row) => (
                  <div className="package-course-editor-row" key={row.id}>
                    <div className="package-course-editor-title">
                      <Sparkles size={18} />
                      <div>
                        <strong>{row.nome}</strong>
                        <small>{row.livello || 'Livello non impostato'} · {row.insegnante || 'Senza insegnante'} · prezzo originale {euro(row.prezzo_corso)}</small>
                      </div>
                    </div>
                    <div className="package-auto-share">
                      <small>Quota assegnata</small>
                      <strong>{euro(row.quota_allievo_mensile)}</strong>
                      <span>Ripartizione automatica</span>
                    </div>
                    <button type="button" className="payments-icon-btn danger package-remove-course-btn" disabled={removeCourseMutation.isPending} onClick={() => removeCourseMutation.mutate({ enrollmentId: row.id, effectiveMonth: month })} title={`Rimuovi corso da ${monthLabel(month)}`}>
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
              {saveMutation.isSuccess ? <p className="success-text">Pacchetto aggiornato correttamente da {monthLabel(month)}. I mesi precedenti restano invariati.</p> : null}

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
