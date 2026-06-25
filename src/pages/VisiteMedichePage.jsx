import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartPulse, Plus, Search, Trash2 } from 'lucide-react'
import { createMedicalVisit, deleteMedicalVisit, fetchMedicalStudents, fetchMedicalVisits } from '../api/medicalVisits'
import { useAuth } from '../context/AuthProvider'

const emptyForm = { tesseramento_id: '', issued_at: '', expires_at: '', doctor: '', notes: '', status: 'valida' }

function statusOf(row) {
  if (!row.expires_at) return { label: row.status || 'Da verificare', cls: 'nova-pill nova-pill--neutral' }
  const diff = dayjs(row.expires_at).diff(dayjs(), 'day')
  if (diff < 0) return { label: 'Scaduta', cls: 'nova-pill nova-pill--warn' }
  if (diff <= 30) return { label: 'In scadenza', cls: 'nova-pill nova-pill--warn' }
  return { label: 'Valida', cls: 'nova-pill nova-pill--ok' }
}

export default function VisiteMedichePage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)

  const studentsQuery = useQuery({ queryKey: ['medical-students'], queryFn: fetchMedicalStudents })
  const visitsQuery = useQuery({ queryKey: ['medical-visits'], queryFn: fetchMedicalVisits })

  const createMutation = useMutation({
    mutationFn: () => {
      const student = (studentsQuery.data || []).find((item) => item.id === form.tesseramento_id)
      if (!student) throw new Error('Seleziona un corsista.')
      return createMedicalVisit({ student, payload: form, file })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-visits'] })
      setOpen(false)
      setForm(emptyForm)
      setFile(null)
    },
  })
  const deleteMutation = useMutation({ mutationFn: deleteMedicalVisit, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medical-visits'] }) })

  const visits = visitsQuery.data || []
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return visits
    return visits.filter((row) => [row.student_name, row.student_email, row.doctor, row.notes].some((v) => String(v || '').toLowerCase().includes(term)))
  }, [visits, search])

  return (
    <section className="page">
      <div className="dashboard-hero"><div><div className="dashboard-hero__eyebrow">Salute e documenti</div><h2 className="dashboard-hero__title">Visite mediche</h2><p className="dashboard-hero__text">Seleziona i corsisti dal database Orchidea Allievi e carica la visita medica come foto/documento.</p></div>{isAdmin ? <button className="topbar__button topbar__button--primary" onClick={() => setOpen(true)}><Plus size={16} /> Nuova visita</button> : null}</div>
      <div className="stats-grid"><div className="page-card tesserati-stat-card"><span>Visite caricate</span><strong>{visits.length}</strong></div><div className="page-card tesserati-stat-card"><span>In scadenza/scadute</span><strong>{visits.filter((v) => statusOf(v).cls.includes('warn')).length}</strong></div></div>
      <div className="page-card">
        <div className="toolbar"><div className="searchWrapper"><Search size={18} /><input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca corsista, medico, note…" /></div></div>
        {visitsQuery.error ? <p className="form-error">{visitsQuery.error.message}</p> : null}
        <div className="tableWrap"><table className="dataTable"><thead><tr><th>Corsista</th><th>Rilascio</th><th>Scadenza</th><th>Stato</th><th>Documento</th><th>Azioni</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan="6">Nessuna visita medica.</td></tr> : filtered.map((row) => { const st = statusOf(row); return <tr key={row.id}><td><strong>{row.student_name}</strong><br /><small>{row.student_email || '—'}</small></td><td>{row.issued_at ? dayjs(row.issued_at).format('DD/MM/YYYY') : '—'}</td><td>{row.expires_at ? dayjs(row.expires_at).format('DD/MM/YYYY') : '—'}</td><td><span className={st.cls}>{st.label}</span></td><td>{row.file_signed_url ? <a className="actionBtn" href={row.file_signed_url} target="_blank" rel="noreferrer">Apri file</a> : '—'}</td><td>{isAdmin ? <button className="actionBtn actionBtn--danger" onClick={() => deleteMutation.mutate(row.id)}><Trash2 size={15} /> Elimina</button> : '—'}</td></tr> })}</tbody></table></div>
      </div>
      {open ? <div className="modalOverlay" onClick={() => setOpen(false)}><div className="modalCard" onClick={(e) => e.stopPropagation()}><div className="section-head"><div><h3>Nuova visita medica</h3><p>Carica foto o PDF della visita.</p></div><HeartPulse /></div><form className="formGrid" onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }}><label>Corsista<select value={form.tesseramento_id} onChange={(e) => setForm({ ...form, tesseramento_id: e.target.value })} required><option value="">Seleziona corsista</option>{(studentsQuery.data || []).map((s) => <option key={s.id} value={s.id}>{s.nomeCompleto} · {s.email || s.telefono || ''}</option>)}</select></label><label>Data rilascio<input type="date" value={form.issued_at} onChange={(e) => setForm({ ...form, issued_at: e.target.value })} /></label><label>Scadenza<input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></label><label>Medico/centro<input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} /></label><label className="formFull">Note<textarea className="formTextarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><label className="formFull">Foto/PDF visita<input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>{createMutation.error ? <p className="form-error">{createMutation.error.message}</p> : null}<div className="modalActions"><button type="button" className="topbar__button" onClick={() => setOpen(false)}>Annulla</button><button className="topbar__button topbar__button--primary">Salva visita</button></div></form></div></div> : null}
    </section>
  )
}
