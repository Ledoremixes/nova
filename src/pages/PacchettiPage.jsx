import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Edit3, Euro, PackageCheck, Plus, Search, Trash2, X } from 'lucide-react'
import { createPackageCatalog, deletePackageCatalog, fetchPackagesCatalog, updatePackageCatalog } from '../api/packagesCatalog'
import { euro } from '../api/orchideaPayments'
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
    pricing_key: null, pricing_group: null, pricing_period: null,
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
      return [item.nome, typeLabel(item.tipo), item.descrizione]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [packagesQuery.data, search])

  const stats = useMemo(() => {
    const all = packagesQuery.data || []
    return {
      total: all.length,
      active: all.filter((item) => item.attivo).length,
      multiMonth: all.filter((item) => Number(item.durata_mesi || 1) > 1).length,
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
    })
    setEditor({ mode: 'edit', item })
  }

  function changeType(value) {
    setForm((current) => ({ ...current, tipo: value, durata_mesi: TYPE_MONTHS[value] || current.durata_mesi || 1 }))
  }

  function submit(event) {
    event.preventDefault()
    saveMutation.mutate({ id: editor?.item?.id, payload: form })
  }

  return (
    <section className="page packages-catalog-page">
      <div className="dashboard-hero packages-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Listino segreteria</div>
          <h2 className="dashboard-hero__title">Pacchetti corsi</h2>
          <p className="dashboard-hero__text">Crea una volta le formule di pagamento e selezionale poi direttamente quando registri l’incasso di un corsista.</p>
        </div>
        <button className="topbar__button topbar__button--primary" type="button" onClick={openCreate}><Plus size={17} /> Nuovo pacchetto</button>
      </div>

      <div className="packages-catalog-stats">
        <div className="page-card packages-catalog-stat"><PackageCheck /><span>Pacchetti creati</span><strong>{stats.total}</strong></div>
        <div className="page-card packages-catalog-stat"><PackageCheck /><span>Attivi</span><strong>{stats.active}</strong></div>
        <div className="page-card packages-catalog-stat"><CalendarRange /><span>Multi-mese</span><strong>{stats.multiMonth}</strong></div>
      </div>

      <div className="page-card packages-catalog-toolbar">
        <label className="packages-catalog-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca pacchetto…" /></label>
        <label className="packages-catalog-toggle"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostra anche disattivati</label>
      </div>

      {packagesQuery.isLoading ? <div className="page-card">Caricamento pacchetti…</div> : null}
      {packagesQuery.error ? <div className="form-error">{packagesQuery.error.message}</div> : null}

      <div className="packages-catalog-grid">
        {packages.map((item) => (
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
            <p>{item.descrizione || 'Nessuna descrizione interna.'}</p>
            <div className="packages-catalog-card__actions">
              <button className="actionBtn" type="button" onClick={() => openEdit(item)}><Edit3 size={15} /> Modifica</button>
              {!item.pricing_key ? <button className="actionBtn packages-delete-btn" type="button" onClick={() => setDeleteTarget(item)}><Trash2 size={15} /> Elimina</button> : null}
            </div>
          </article>
        ))}
      </div>

      {!packagesQuery.isLoading && !packagesQuery.error && packages.length === 0 ? <div className="page-card packages-empty">Nessun pacchetto trovato. Crea il primo con “Nuovo pacchetto”.</div> : null}

      {editor ? (
        <div className="modalOverlay" onClick={() => setEditor(null)}>
          <form className="modalCard packages-catalog-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <div className="packages-catalog-modal__hero">
              <div><div className="dashboard-hero__eyebrow">{editor.mode === 'create' ? 'Nuova formula' : 'Modifica formula'}</div><h3>{editor.mode === 'create' ? 'Crea pacchetto' : form.nome}</h3><p>Il prezzo sarà proposto automaticamente in Pagamenti, ma resterà sempre modificabile al momento dell’incasso. I pacchetti “A gettone” valgono una sola lezione e non saldano il mese.</p></div>
              <button type="button" className="package-editor-close" onClick={() => setEditor(null)}><X size={20} /></button>
            </div>

            <div className="packages-catalog-form">
              <label>Nome pacchetto<input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Es. Trimestrale 2 corsi" required /></label>
              <label>Tipologia<select value={form.tipo} onChange={(e) => changeType(e.target.value)} disabled={Boolean(form.pricing_key)}>{TYPE_OPTIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select>{form.pricing_key ? <small>Formula del listino automatico 2026/2027: puoi modificarne nome e prezzo, mentre durata e tipologia restano collegate al calcolo automatico.</small> : null}</label>
              <label>Prezzo €<input type="number" min="0" step="0.01" value={form.prezzo} onChange={(e) => setForm({ ...form, prezzo: e.target.value })} required /></label>
              {form.tipo === 'gettone' ? <label>Copertura<input value="Lezione singola" disabled /><small>Il gettone non chiude e non copre l’intero mese.</small></label> : <label>Mesi coperti<input type="number" min="1" max="24" step="1" value={form.durata_mesi} onChange={(e) => setForm({ ...form, durata_mesi: Number(e.target.value || 1) })} required disabled={Boolean(form.pricing_key)} /></label>}
              <label className="packages-catalog-form__wide">Descrizione / note interne<textarea value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. valido per tre mesi consecutivi…" /></label>
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
