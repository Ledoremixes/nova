import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Camera,
  Download,
  Eye,
  FileText,
  Film,
  GlassWater,
  Martini,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { createVolunteer, deleteVolunteer, fetchVolunteers, updateVolunteer } from '../api/volunteers'
import { createVolunteerContractPdfBlob, generateVolunteerContractPdf } from '../utils/volunteerContractPdf'
import { useAuth } from '../context/authContext'
import '../styles/VolontariPage.css'

const ROLES = [
  { value: 'barman', label: 'Barman', icon: GlassWater },
  { value: 'cameriere', label: 'Cameriere', icon: UsersRound },
  { value: 'barlady', label: 'Barlady', icon: Martini },
  { value: 'ballerino', label: 'Ballerino', icon: Sparkles },
  { value: 'animatore', label: 'Animatore', icon: BadgeCheck },
  { value: 'videomaker', label: 'Videomaker', icon: Film },
  { value: 'fotografo', label: 'Fotografo', icon: Camera },
]

const emptyForm = {
  full_name: '', email: '', phone: '', tax_code: '', birth_date: '', birth_place: '', birth_province: '',
  residence_address: '', residence_city: '', residence_province: '', residence_postal_code: '',
  role: 'barman', additional_roles: [], duties: '',
  venue: 'Club Orchidea ASD - Via Giuseppe Ungaretti 34, Saronno (VA)',
  contract_start_date: '2026-09-07', contract_end_date: '2027-06-30', notice_days: 15,
  signing_place: 'Saronno', notes: '', active: true,
}

const organization = {
  organization_name: 'CLUB ORCHIDEA ASD',
  organization_legal_address: 'Limbiate (MB), Via Giotto 56A',
  organization_tax_code: '14275140961',
  organization_representative: 'Manuel Ledonne',
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
function roleMeta(role) { return ROLES.find((item) => item.value === role) || ROLES[0] }
function humanDate(value) {
  if (!value) return 'Non indicata'
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT')
}
function toForm(row = {}) { return { ...emptyForm, ...row, additional_roles: Array.isArray(row.additional_roles) ? row.additional_roles : [] } }

export default function VolontariPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('tutti')
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [contractPreviewRow, setContractPreviewRow] = useState(null)
  const [contractPreviewUrl, setContractPreviewUrl] = useState('')
  const [contractPreviewLoading, setContractPreviewLoading] = useState(false)
  const [contractPreviewError, setContractPreviewError] = useState('')

  const query = useQuery({
    queryKey: ['sport-volunteers', 'full-access'],
    queryFn: () => fetchVolunteers({ includePrivate: true }),
  })
  const save = useMutation({
    mutationFn: (payload) => editing?.id ? updateVolunteer(editing.id, payload) : createVolunteer(payload),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['sport-volunteers'] }); closeModal() },
    onError: (err) => setError(err?.message || 'Impossibile salvare il volontario.'),
  })
  const remove = useMutation({
    mutationFn: deleteVolunteer,
    onSuccess: () => client.invalidateQueries({ queryKey: ['sport-volunteers'] }),
    onError: (err) => window.alert(err?.message || 'Impossibile eliminare il volontario.'),
  })

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (query.data || []).filter((row) => {
      const matchesTerm = !term || [row.full_name, row.email, row.phone, row.tax_code, row.role].some((v) => String(v || '').toLowerCase().includes(term))
      const matchesRole = roleFilter === 'tutti' || row.role === roleFilter || row.additional_roles?.includes(roleFilter)
      return matchesTerm && matchesRole
    })
  }, [query.data, search, roleFilter])

  function openNew() { if (!isAdmin) return; setEditing(null); setForm({ ...emptyForm }); setError(''); setIsModalOpen(true) }
  function openEdit(row) { if (!isAdmin) return; setEditing(row); setForm(toForm(row)); setError(''); setIsModalOpen(true) }
  function closeModal() { setEditing(null); setForm({ ...emptyForm }); setError(''); setIsModalOpen(false) }
  function updateField(name, value) { setForm((current) => ({ ...current, [name]: value })) }
  function toggleExtraRole(value) {
    setForm((current) => ({
      ...current,
      additional_roles: current.additional_roles.includes(value)
        ? current.additional_roles.filter((item) => item !== value)
        : [...current.additional_roles, value],
    }))
  }
  function submit(e) {
    e.preventDefault(); setError('')
    if (!isAdmin) return setError('Solo un amministratore può modificare le anagrafiche dei volontari.')
    if (!form.full_name.trim()) return setError('Inserisci nome e cognome.')
    if (!form.tax_code.trim()) return setError('Inserisci il codice fiscale.')
    if (form.contract_end_date && form.contract_start_date && form.contract_end_date < form.contract_start_date) return setError('La data di fine deve essere successiva alla data di inizio.')
    save.mutate({ ...form, full_name: form.full_name.trim(), tax_code: form.tax_code.trim().toUpperCase(), notice_days: Number(form.notice_days || 15) })
  }
  function confirmDelete(row) {
    if (!isAdmin) return
    if (window.confirm(`Sei sicuro di voler eliminare il volontario ${row.full_name}? L'operazione è definitiva.`)) remove.mutate(row.id)
  }

  useEffect(() => {
    return () => {
      if (contractPreviewUrl) URL.revokeObjectURL(contractPreviewUrl)
    }
  }, [contractPreviewUrl])

  async function openContractPreview(row) {
    setContractPreviewRow(row)
    setContractPreviewUrl('')
    setContractPreviewError('')
    setContractPreviewLoading(true)
    try {
      const blob = await createVolunteerContractPdfBlob(row, organization)
      setContractPreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      setContractPreviewError(err?.message || 'Impossibile generare l’anteprima del contratto.')
    } finally {
      setContractPreviewLoading(false)
    }
  }

  function closeContractPreview() {
    setContractPreviewRow(null)
    setContractPreviewUrl('')
    setContractPreviewError('')
    setContractPreviewLoading(false)
  }


  return (
    <div className="vol-page">
      <section className="vol-hero">
        <div>
          <span className="vol-eyebrow">GESTIONE COLLABORATORI GRATUITI</span>
          <h1>Volontari sportivi</h1>
          <p>Anagrafiche, ruoli e accordi di volontariato sportivo pronti da stampare. Nessun compenso viene calcolato o registrato.</p>
        </div>
        {isAdmin ? (
          <button className="vol-primary" onClick={openNew}><Plus size={18} /> Nuovo volontario</button>
        ) : (
          <span className="vol-readonly-badge">Profilo operatore · consultazione completa</span>
        )}
      </section>

      <section className="vol-stats">
        <article><span>Volontari registrati</span><strong>{query.data?.length || 0}</strong><small>Anagrafiche complessive</small></article>
        <article><span>Attivi</span><strong>{(query.data || []).filter((r) => r.active).length}</strong><small>Disponibili nella stagione</small></article>
        <article><span>Ruoli coperti</span><strong>{new Set((query.data || []).flatMap((r) => [r.role, ...(r.additional_roles || [])])).size}</strong><small>Su {ROLES.length} ruoli previsti</small></article>
      </section>

      <section className="vol-toolbar">
        <label className="vol-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nome, codice fiscale, telefono o ruolo" /></label>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="tutti">Tutti i ruoli</option>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {query.isError && <div className="vol-error">{query.error?.message}</div>}
      {query.isLoading ? <div className="vol-empty">Caricamento volontari…</div> : (
        <section className="vol-grid">
          {rows.map((row) => {
            const meta = roleMeta(row.role); const Icon = meta.icon
            return <article className="vol-card" key={row.id}>
              <div className="vol-card__head">
                <div className="vol-avatar">{initials(row.full_name)}</div>
                <div><h2>{row.full_name}</h2><div className="vol-role"><Icon size={15} /> {meta.label}</div></div>
                <span className={`vol-status ${row.active ? 'is-active' : ''}`}>{row.active ? 'Attivo' : 'Non attivo'}</span>
              </div>
              <div className="vol-card__body">
                <dl>
                  <div><dt>Codice fiscale</dt><dd>{row.tax_code || '—'}</dd></div>
                  <div><dt>Contatti</dt><dd>{[row.email, row.phone].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt>Residenza</dt><dd>{[row.residence_city, row.residence_province].filter(Boolean).join(' ') || '—'}</dd></div>
                  <div><dt>Accordo</dt><dd>{humanDate(row.contract_start_date)} – {humanDate(row.contract_end_date)}</dd></div>
                  <div className="wide"><dt>Attività</dt><dd>{row.duties || 'Nessuna mansione indicata'}</dd></div>
                </dl>
                {row.additional_roles?.length > 0 && <div className="vol-tags">{row.additional_roles.map((r) => <span key={r}>{roleMeta(r).label}</span>)}</div>}
              </div>
              <div className="vol-card__actions">
                <button onClick={() => setViewing(row)}><Eye size={16} /> Apri scheda</button>
                <button onClick={() => openContractPreview(row)}><FileText size={16} /> Anteprima contratto</button>
                {isAdmin ? <button onClick={() => openEdit(row)}><Pencil size={16} /> Modifica</button> : null}
                {isAdmin ? <button className="danger" onClick={() => confirmDelete(row)}><Trash2 size={16} /></button> : null}
              </div>
            </article>
          })}
          {!rows.length && <div className="vol-empty">Nessun volontario corrisponde ai filtri selezionati.</div>}
        </section>
      )}

      {viewing && <div className="vol-modal" role="dialog" aria-modal="true" onClick={() => setViewing(null)}>
        <div className="vol-modal__panel vol-profile-panel" onClick={(e) => e.stopPropagation()}>
          <header>
            <div><span className="vol-eyebrow">SCHEDA VOLONTARIO</span><h2>{viewing.full_name}</h2><p>{roleMeta(viewing.role).label} · {viewing.active ? 'Attivo' : 'Non attivo'}</p></div>
            <button onClick={() => setViewing(null)} aria-label="Chiudi scheda"><X /></button>
          </header>
          <div className="vol-profile-content">
            <section>
              <h3>Profilo operativo</h3>
              <dl className="vol-profile-grid">
                <div><dt>Ruolo principale</dt><dd>{roleMeta(viewing.role).label}</dd></div>
                <div><dt>Contatti</dt><dd>{[viewing.email, viewing.phone].filter(Boolean).join(' · ') || '—'}</dd></div>
                <div className="wide"><dt>Mansioni</dt><dd>{viewing.duties || 'Nessuna mansione indicata'}</dd></div>
                <div className="wide"><dt>Sede attività</dt><dd>{viewing.venue || '—'}</dd></div>
                <div><dt>Inizio accordo</dt><dd>{humanDate(viewing.contract_start_date)}</dd></div>
                <div><dt>Fine accordo</dt><dd>{humanDate(viewing.contract_end_date)}</dd></div>
              </dl>
              {viewing.additional_roles?.length > 0 && <div className="vol-tags">{viewing.additional_roles.map((r) => <span key={r}>{roleMeta(r).label}</span>)}</div>}
            </section>
            <section>
              <h3>Dati anagrafici e amministrativi</h3>
              <dl className="vol-profile-grid">
                <div><dt>Codice fiscale</dt><dd>{viewing.tax_code || '—'}</dd></div>
                <div><dt>Data di nascita</dt><dd>{humanDate(viewing.birth_date)}</dd></div>
                <div><dt>Luogo di nascita</dt><dd>{[viewing.birth_place, viewing.birth_province ? `(${viewing.birth_province})` : ''].filter(Boolean).join(' ') || '—'}</dd></div>
                <div><dt>Email</dt><dd>{viewing.email || '—'}</dd></div>
                <div><dt>Telefono</dt><dd>{viewing.phone || '—'}</dd></div>
                <div><dt>Preavviso</dt><dd>{Number(viewing.notice_days || 15)} giorni</dd></div>
                <div className="wide"><dt>Residenza completa</dt><dd>{[viewing.residence_address, viewing.residence_postal_code, viewing.residence_city, viewing.residence_province ? `(${viewing.residence_province})` : ''].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt>Luogo firma</dt><dd>{viewing.signing_place || '—'}</dd></div>
                <div><dt>Ultimo aggiornamento</dt><dd>{viewing.updated_at ? new Date(viewing.updated_at).toLocaleString('it-IT') : '—'}</dd></div>
                <div className="wide"><dt>Note interne</dt><dd>{viewing.notes || 'Nessuna nota'}</dd></div>
              </dl>
            </section>
          </div>
          <footer className="vol-profile-actions">
            <button type="button" onClick={() => setViewing(null)}>Chiudi</button>
            <button type="button" onClick={() => { const row = viewing; setViewing(null); openContractPreview(row) }}><FileText size={16} /> Anteprima contratto</button>
            {isAdmin ? <button type="button" className="vol-primary" onClick={() => { const row = viewing; setViewing(null); openEdit(row) }}><Pencil size={16} /> Modifica dati</button> : null}
          </footer>
        </div>
      </div>}


      {contractPreviewRow && <div className="vol-modal vol-contract-preview-modal" role="dialog" aria-modal="true" onClick={closeContractPreview}>
        <div className="vol-modal__panel vol-contract-preview-panel" onClick={(e) => e.stopPropagation()}>
          <header>
            <div>
              <span className="vol-eyebrow">DOCUMENTO RIGENERABILE</span>
              <h2>Anteprima contratto di volontariato</h2>
              <p>{contractPreviewRow.full_name} · {roleMeta(contractPreviewRow.role).label}</p>
            </div>
            <button onClick={closeContractPreview} aria-label="Chiudi anteprima"><X /></button>
          </header>
          <div className="vol-contract-preview-body">
            {contractPreviewLoading ? <div className="vol-contract-loading">Sto preparando il documento…</div> : null}
            {contractPreviewError ? <div className="vol-error">{contractPreviewError}</div> : null}
            {contractPreviewUrl ? (
              <iframe
                className="vol-contract-frame"
                src={`${contractPreviewUrl}#toolbar=1&navpanes=0&view=FitH`}
                title={`Contratto volontariato ${contractPreviewRow.full_name}`}
              />
            ) : null}
          </div>
          <footer className="vol-profile-actions vol-contract-preview-actions">
            <button type="button" onClick={closeContractPreview}>Chiudi</button>
            <button type="button" className="vol-primary" onClick={() => generateVolunteerContractPdf(contractPreviewRow, organization)} disabled={contractPreviewLoading}>
              <Download size={16} /> Scarica PDF
            </button>
          </footer>
        </div>
      </div>}

      {isModalOpen && <div className="vol-modal" role="dialog" aria-modal="true">
        <div className="vol-modal__panel">
          <header><div><span className="vol-eyebrow">SCHEDA VOLONTARIO</span><h2>{editing ? `Modifica ${editing.full_name}` : 'Nuovo volontario sportivo'}</h2></div><button onClick={closeModal}><X /></button></header>
          <form onSubmit={submit}>
            <section><h3>Dati anagrafici</h3><div className="vol-form-grid">
              <label className="wide">Nome e cognome<input value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} required /></label>
              <label>Codice fiscale<input value={form.tax_code} onChange={(e) => updateField('tax_code', e.target.value)} required /></label>
              <label>Data di nascita<input type="date" value={form.birth_date} onChange={(e) => updateField('birth_date', e.target.value)} /></label>
              <label>Luogo di nascita<input value={form.birth_place} onChange={(e) => updateField('birth_place', e.target.value)} /></label>
              <label>Provincia nascita<input maxLength="2" value={form.birth_province} onChange={(e) => updateField('birth_province', e.target.value.toUpperCase())} /></label>
              <label>Email<input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} /></label>
              <label>Telefono<input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} /></label>
            </div></section>
            <section><h3>Residenza</h3><div className="vol-form-grid">
              <label className="wide">Indirizzo<input value={form.residence_address} onChange={(e) => updateField('residence_address', e.target.value)} /></label>
              <label>Città<input value={form.residence_city} onChange={(e) => updateField('residence_city', e.target.value)} /></label>
              <label>Provincia<input maxLength="2" value={form.residence_province} onChange={(e) => updateField('residence_province', e.target.value.toUpperCase())} /></label>
              <label>CAP<input value={form.residence_postal_code} onChange={(e) => updateField('residence_postal_code', e.target.value)} /></label>
            </div></section>
            <section><h3>Ruolo e attività</h3><div className="vol-form-grid">
              <label>Ruolo principale<select value={form.role} onChange={(e) => updateField('role', e.target.value)}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
              <label className="wide">Mansioni<textarea rows="3" value={form.duties} onChange={(e) => updateField('duties', e.target.value)} placeholder="Descrivi le attività assegnate" /></label>
              <div className="wide"><span className="vol-label">Ruoli aggiuntivi</span><div className="vol-role-picker">{ROLES.filter((r) => r.value !== form.role).map((r) => <label key={r.value}><input type="checkbox" checked={form.additional_roles.includes(r.value)} onChange={() => toggleExtraRole(r.value)} />{r.label}</label>)}</div></div>
            </div></section>
            <section><h3>Accordo di volontariato</h3><div className="vol-form-grid">
              <label>Data inizio<input type="date" value={form.contract_start_date} onChange={(e) => updateField('contract_start_date', e.target.value)} /></label>
              <label>Data fine<input type="date" value={form.contract_end_date} onChange={(e) => updateField('contract_end_date', e.target.value)} /></label>
              <label>Preavviso (giorni)<input type="number" min="0" value={form.notice_days} onChange={(e) => updateField('notice_days', e.target.value)} /></label>
              <label>Luogo firma<input value={form.signing_place} onChange={(e) => updateField('signing_place', e.target.value)} /></label>
              <label className="wide">Sede attività<input value={form.venue} onChange={(e) => updateField('venue', e.target.value)} /></label>
              <label className="wide">Note interne<textarea rows="3" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} /></label>
              <label className="vol-active wide"><input type="checkbox" checked={form.active} onChange={(e) => updateField('active', e.target.checked)} /> Volontario attivo</label>
            </div></section>
            {error && <div className="vol-error">{error}</div>}
            <footer><button type="button" onClick={closeModal}>Annulla</button><button className="vol-primary" disabled={save.isPending}>{save.isPending ? 'Salvataggio…' : 'Salva volontario'}</button></footer>
          </form>
        </div>
      </div>}
    </div>
  )
}
