import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserCog } from 'lucide-react'
import { fetchGestionaleUsers, updateGestionaleUser } from '../api/usersManagement'

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ role: 'user', is_active: true })

  const usersQuery = useQuery({ queryKey: ['gestionale-users'], queryFn: fetchGestionaleUsers })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateGestionaleUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestionale-users'] })
      setEditing(null)
    },
  })

  function openEdit(user) {
    setEditing(user)
    setForm({ role: user.role || 'user', is_active: user.is_active !== false })
  }

  function save(e) {
    e.preventDefault()
    updateMutation.mutate({ id: editing.id, payload: form })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Permessi gestionale</div>
          <h2 className="dashboard-hero__title">Utenti</h2>
          <p className="dashboard-hero__text">Gestisci chi può accedere a Nova e quali sezioni vede. Gli utenti normali non vedono contabilità e cifre.</p>
        </div>
      </div>

      <div className="page-card">
        {usersQuery.isLoading ? <p>Caricamento utenti…</p> : null}
        {usersQuery.error ? <p className="form-error">Errore: {usersQuery.error.message}</p> : null}
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Accesso</th><th>Azioni</th></tr></thead>
            <tbody>
              {(usersQuery.data || []).map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.email}</strong><br /><small>{user.id}</small></td>
                  <td><span className={user.role === 'admin' ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{user.role || 'user'}</span></td>
                  <td>{user.is_active !== false ? 'Attivo' : 'Disattivato'}</td>
                  <td>{user.role === 'admin' ? 'Tutte le sezioni' : 'Dashboard senza cifre, tesserati, gruppi, atleti, insegnanti'}</td>
                  <td><button className="actionBtn" onClick={() => openEdit(user)}><UserCog size={15} /> Permessi</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="modalOverlay" onClick={() => setEditing(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><div><h3>Permessi utente</h3><p>{editing.email}</p></div><ShieldCheck /></div>
            <form className="formGrid" onSubmit={save}>
              <label>Ruolo
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="user">Utente normale</option>
                </select>
              </label>
              <label className="check-card"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Utente attivo</label>
              {updateMutation.error ? <p className="form-error">{updateMutation.error.message}</p> : null}
              <div className="modalActions"><button type="button" className="topbar__button" onClick={() => setEditing(null)}>Annulla</button><button className="topbar__button topbar__button--primary">Salva</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
