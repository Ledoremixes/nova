import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, CalendarRange, Check, Edit3, Euro, PackageCheck, Plus, Search, Trash2, X } from 'lucide-react'
import { createPackageCatalog, deletePackageCatalog, fetchPackagesCatalog, updatePackageCatalog } from '../api/packagesCatalog'
import { fetchOrchideaCourseCatalog } from '../api/orchideaEntities'
import { euro } from '../api/orchideaPayments'
import { courseDisplayName, courseDisplaySubtitle } from '../lib/courseLabels'
import '../styles/PacchettiPage.css'

const TYPE_OPTIONS = [
  ['gettone', 'A gettone'],
  ['mensile', 'Mensile'],
  ['trimestrale', 'Trimestrale'],
  ['annuale', 'Annuale'],
  ['all_you_can_dance', 'All You Can Dance'],
  ['altro', 'Altro'],
]

const TYPE_MONTHS = {
  gettone: 1,
  mensile: 1,
  trimestrale: 3,
  annuale: 12,
  all_you_can_dance: 1,
  altro: 1,
}

function typeLabel(value) {
  return TYPE_OPTIONS.find(([id]) => id === value)?.[1] || 'Altro'
}

function emptyForm() {
  return {
    nome: '', tipo: 'mensile', durata_mesi: 1, prezzo: '', descrizione: '', attivo: true, ordine: 0,
    pricing_key: null, pricing_group: null, pricing_period: null, course_ids: [], stackable: false, covered_course_count: '',
  }
}

export default function PacchettiPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState(null)

  const packagesQuery = useQuery({
    queryKey: ['nova-packages-catalog', { showInactive }],
    queryFn: () => fetchPackagesCatalog({ includeInactive: showInactive }),
  })

  const coursesQuery = useQuery({
    queryKey: ['orchidea-course-catalog'],
    queryFn: fetchOrchideaCourseCatalog,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  })

  const courses = useMemo(
    () => (coursesQuery.data || []).filter((course) => course.attivo !== false),
    [coursesQuery.data],
  )
  const courseById = useMemo(() => new Map(courses.map((course) => [String(course.id), course])), [courses])

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }) => id ? updatePackageCatalog(id, payload) : createPackageCatalog(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-packages-catalog'] })
      setEditor(null)
      setForm(emptyForm())
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deletePackageCatalog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nova-packages-catalog'] })
      setDeleteTarget(null)
    },
  })

  const packages = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (packagesQuery.data || []).filter((item) => {
      if (!needle) return true
      const courseNames = (item.course_ids || [])
        .map((id) => courseById.get(String(id)))
        .filter(Boolean)
        .map(courseDisplayName)
      return [item.nome, typeLabel(item.tipo), item.descrizione, ...courseNames]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [packagesQuery.data, search, courseById])

  const stats = useMemo(() => {
    const all = packagesQuery.data || []
    return {
      total: all.length,
      active: all.filter((item) => item.attivo).length,
      linked: all.filter((item) => (item.course_ids || []).length > 0).length,
    }
  }, [packagesQuery.data])

  function openCreate() {
    setForm(emptyForm())
    setEditor({ mode: 'create' })
  }

  function openEdit(item) {
    setForm({
      nome: item.nome || '',
      tipo: item.tipo || 'mensile',
      durata_mesi: Number(item.durata_mesi || 1),
      prezzo: Number(item.prezzo || 0).toFixed(2),
      descrizione: item.descrizione || '',
      attivo: item.attivo !== false,
      ordine: Number(item.ordine || 0),
      pricing_key: item.pricing_key || null,
      pricing_group: item.pricing_group || null,
      pricing_period: item.pricing_period || null,
      course_ids: item.pricing_key ? [] : (Array.isArray(item.course_ids) ? item.course_ids.map(String) : []),
      stackable: item.pricing_key ? false : item.stackable === true,
      covered_course_count: item.pricing_key ? '' : (item.covered_course_count || ''),
    })
    setEditor({ mode: 'edit', item })
  }

  function changeType(value) {
    setForm((current) => ({ ...current, tipo: value, durata_mesi: TYPE_MONTHS[value] || current.durata_mesi || 1 }))
  }

  function toggleCourse(courseId) {
    const id = String(courseId)
    setForm((current) => ({
      ...current,
      course_ids: current.course_ids.includes(id)
        ? current.course_ids.filter((value) => value !== id)
        : [...current.course_ids, id],
    }))
  }

  function submit(event) {
    event.preventDefault()
    const payload = form.pricing_key
      ? { ...form, course_ids: [], stackable: false, covered_course_count: null }
      : {
          ...form,
          covered_course_count: form.stackable
            ? (Number(form.covered_course_count || 0) > 0 ? Math.floor(Number(form.covered_course_count)) : null)
            : null,
        }
    saveMutation.mutate({ id: editor?.item?.id, payload })
  }

  return (
    <section className="page packages-catalog-page">
      <div className="dashboard-hero packages-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Listino segreteria</div>
          <h2 className="dashboard-hero__title">Pacchetti corsi</h2>
          <p className="dashboard-hero__text">Il listino standard viene riconosciuto automaticamente dai corsi dell’allievo. Le associazioni manuali ai corsi sono riservate ai pacchetti personalizzati degli insegnanti.</p>
        </div>
        <button className="topbar__button topbar__button--primary" type="button" onClick={openCreate}><Plus size={17} /> Nuovo pacchetto</button>
      </div>

      <div className="packages-catalog-stats">
        <div className="page-card packages-catalog-stat"><PackageCheck /><span>Pacchetti creati</span><strong>{stats.total}</strong></div>
        <div className="page-card packages-catalog-stat"><PackageCheck /><span>Attivi</span><strong>{stats.active}</strong></div>
        <div className="page-card packages-catalog-stat"><BookOpenCheck /><span>Legati a corsi</span><strong>{stats.linked}</strong></div>
      </div>

      <div className="page-card packages-catalog-toolbar">
        <label className="packages-catalog-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca pacchetto o corso…" /></label>
        <label className="packages-catalog-toggle"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostra anche disattivati</label>
      </div>

      {packagesQuery.isLoading ? <div className="page-card">Caricamento pacchetti…</div> : null}
      {packagesQuery.error ? <div className="form-error">{packagesQuery.error.message}</div> : null}

      <div className="packages-catalog-grid">
        {packages.map((item) => {
          const linkedCourses = (item.course_ids || []).map((id) => courseById.get(String(id))).filter(Boolean)
          return (
            <article className={`page-card packages-catalog-card ${item.attivo ? '' : 'is-inactive'}`} key={item.id}>
              <div className="packages-catalog-card__head">
                <div className="packages-catalog-card__icon"><PackageCheck size={21} /></div>
                <div>
                  <span className="packages-catalog-type">{typeLabel(item.tipo)}{item.pricing_key ? ' · Listino 2026/2027' : ''}</span>
                  <h3>{item.nome}</h3>
                </div>
                <span className={item.attivo ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{item.attivo ? 'Attivo' : 'Disattivato'}</span>
              </div>
              <div className="packages-catalog-card__price"><Euro size={18} /><strong>{euro(item.prezzo)}</strong></div>
              <div className="packages-catalog-card__coverage"><CalendarRange size={17} /><span>{item.tipo === 'gettone' ? '1 lezione singola · nessuna copertura mensile' : item.durata_mesi === 1 ? '1 mese di copertura' : `${item.durata_mesi} mesi di copertura`}</span></div>
              <div className="packages-catalog-card__courses">
                <BookOpenCheck size={17} />
                <div>
                  <span>{item.pricing_key ? 'Rilevamento' : item.stackable ? 'Componente cumulabile' : 'Valido per'}</span>
                  {item.pricing_key
                    ? <strong>Automatico in base ai corsi iscritti</strong>
                    : linkedCourses.length
                      ? <strong>{linkedCourses.map(courseDisplayName).join(' · ')}</strong>
                      : <strong>Tutti i corsi compatibili</strong>}
                  {item.stackable ? <small>Copre {item.covered_course_count || item.course_ids?.length || 1} corsi tra quelli abilitati e si somma automaticamente agli eventuali corsi rimanenti.</small> : null}
                </div>
              </div>
              <p>{item.descrizione || 'Nessuna descrizione interna.'}</p>
              <div className="packages-catalog-card__actions">
                <button className="actionBtn" type="button" onClick={() => openEdit(item)}><Edit3 size={15} /> Modifica</button>
                {!item.pricing_key ? <button className="actionBtn packages-delete-btn" type="button" onClick={() => setDeleteTarget(item)}><Trash2 size={15} /> Elimina</button> : null}
              </div>
            </article>
          )
        })}
      </div>

      {!packagesQuery.isLoading && !packagesQuery.error && packages.length === 0 ? <div className="page-card packages-empty">Nessun pacchetto trovato. Crea il primo con “Nuovo pacchetto”.</div> : null}

      {editor ? (
        <div className="modalOverlay" onClick={() => setEditor(null)}>
          <form className="modalCard packages-catalog-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <div className="packages-catalog-modal__hero">
              <div><div className="dashboard-hero__eyebrow">{editor.mode === 'create' ? 'Nuova formula' : 'Modifica formula'}</div><h3>{editor.mode === 'create' ? 'Crea pacchetto' : form.nome}</h3><p>{form.pricing_key ? 'Questo è un pacchetto del listino automatico: Nova lo abbina da sola alla corretta combinazione di corsi. Non servono associazioni manuali.' : form.stackable ? 'Questa formula è una componente della quota: Nova la applica ai corsi associati e somma automaticamente gli eventuali altri corsi.' : 'Per i pacchetti personalizzati puoi scegliere i corsi per cui sono validi. Se lasci vuoto, la formula resta generale.'}</p></div>
              <button type="button" className="package-editor-close" onClick={() => setEditor(null)}><X size={20} /></button>
            </div>

            <div className="packages-catalog-form">
              <label>Nome pacchetto<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Es. Country 1 corso e mezzo" required /></label>
              <label>Tipologia<select value={form.tipo} onChange={(e) => changeType(e.target.value)} disabled={Boolean(form.pricing_key)}>{TYPE_OPTIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>{form.pricing_key ? <small>Formula del listino automatico 2026/2027: puoi modificarne nome e prezzo. I corsi vengono rilevati automaticamente da Nova; durata e tipologia restano collegate al calcolo automatico.</small> : null}</label>
              <label>Prezzo €<input type="number" min="0" step="0.01" value={form.prezzo} onChange={(e) => setForm({ ...form, prezzo: e.target.value })} required /></label>
              {form.tipo === 'gettone' ? <label>Copertura<input value="Lezione singola" disabled /><small>Il gettone non chiude e non copre l’intero mese.</small></label> : <label>Mesi coperti<input type="number" min="1" max="24" step="1" value={form.durata_mesi} onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value || 1) })} required disabled={Boolean(form.pricing_key)} /></label>}

              {!form.pricing_key ? (
                <label className="check-card packages-catalog-stackable packages-catalog-form__wide">
                  <input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} />
                  <span>Componente cumulabile della quota</span>
                  <small>Attivala quando questa cifra copre solo una parte dell’iscrizione e deve sommarsi agli altri corsi. Esempio: 3 ore Country 45 € + Kizomba base 40 € = 85 €.</small>
                </label>
              ) : null}

              {!form.pricing_key && form.stackable ? (
                <label>Quanti corsi copre questa quota?
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, form.course_ids.length || 1)}
                    step="1"
                    value={form.covered_course_count}
                    onChange={(e) => setForm({ ...form, covered_course_count: e.target.value })}
                    placeholder={form.course_ids.length ? String(form.course_ids.length) : 'Es. 3'}
                  />
                  <small>Se lasci vuoto, Nova usa tutti i corsi abilitati selezionati. Per “3 ore Country” imposta 3.</small>
                </label>
              ) : null}

              {!form.pricing_key ? (
              <div className="packages-course-scope packages-catalog-form__wide">
                <div className="packages-course-scope__head">
                  <div><span>{form.stackable ? 'Corsi in cui è valida la componente' : 'Corsi abilitati'}</span><strong>{form.course_ids.length ? `${form.course_ids.length} selezionati` : form.stackable ? 'Seleziona i corsi validi' : 'Tutti i corsi compatibili'}</strong></div>
                  {form.course_ids.length ? <button type="button" onClick={() => setForm((current) => ({ ...current, course_ids: [] }))}>Azzera selezione</button> : null}
                </div>
                {coursesQuery.isLoading ? <div className="packages-course-scope__loading">Caricamento corsi…</div> : null}
                {coursesQuery.isError ? <div className="form-error">Non riesco a caricare i corsi. Il pacchetto può comunque essere salvato come generale.</div> : null}
                <div className="packages-course-scope__grid">
                  {courses.map((course) => {
                    const id = String(course.id)
                    const selected = form.course_ids.includes(id)
                    return (
                      <button type="button" key={id} className={selected ? 'is-selected' : ''} onClick={() => toggleCourse(id)}>
                        <span className="packages-course-scope__check">{selected ? <Check size={15} /> : null}</span>
                        <span><strong>{courseDisplayName(course)}</strong><small>{courseDisplaySubtitle(course)}</small></span>
                      </button>
                    )
                  })}
                </div>
                <small className="packages-course-scope__hint">{form.stackable ? 'Seleziona qui il bacino di corsi per cui la tariffa è valida; sopra indica quanti ne copre. Nova userà la componente quando l’allievo frequenta quel numero di corsi del bacino e sommerà automaticamente gli altri corsi.' : 'I corsi selezionati definiscono l’area di validità del pacchetto. Una formula normale resta un’alternativa completa e non viene sommata ad altri pacchetti.'}</small>
              </div>
              ) : (
                <div className="packages-course-scope packages-catalog-form__wide">
                  <div className="packages-course-scope__head"><div><span>Associazione corsi</span><strong>Gestita automaticamente</strong></div></div>
                  <small className="packages-course-scope__hint">I pacchetti standard come 1 corso, Bachata + Salsa, 3 corsi e All You Can Dance vengono scelti in base ai corsi effettivamente iscritti. Per regole particolari degli insegnanti usa invece un pacchetto personalizzato e, quando deve sommarsi ad altri corsi, attiva “Componente cumulabile”.</small>
                </div>
              )}

              <label className="packages-catalog-form__wide">Descrizione / note interne<textarea value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. formula proposta dall’insegnante Country…" /></label>
              <label className="check-card packages-catalog-active"><input type="checkbox" checked={form.attivo} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} /><span>Pacchetto attivo</span><small>Se disattivato resta nello storico ma non viene proposto nei nuovi pagamenti.</small></label>
            </div>

            {saveMutation.error ? <div className="form-error">{saveMutation.error.message}</div> : null}
            <div className="modalActions"><button type="button" className="topbar__button" onClick={() => setEditor(null)}>Annulla</button><button className="topbar__button topbar__button--primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvataggio…' : 'Salva pacchetto'}</button></div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modalOverlay" onClick={() => setDeleteTarget(null)}>
          <div className="modalCard packages-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="packages-confirm-icon"><Trash2 size={24} /></div>
            <h3>Eliminare questo pacchetto?</h3>
            <p>Stai per eliminare <strong>{deleteTarget.nome}</strong>. I pagamenti storici già registrati manterranno nome, prezzo e durata salvati al momento dell’incasso.</p>
            {deleteMutation.error ? <div className="form-error">{deleteMutation.error.message}</div> : null}
            <div className="modalActions"><button className="topbar__button" type="button" onClick={() => setDeleteTarget(null)}>Annulla</button><button className="topbar__button packages-danger-primary" type="button" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Elimino…' : 'Elimina pacchetto'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
