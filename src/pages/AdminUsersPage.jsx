import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, Sparkles, Trash2, UserCog, X } from 'lucide-react'
import { createGestionaleUser, deleteGestionaleUser, fetchGestionaleUsers, updateGestionaleUser } from '../api/usersManagement'

const emptyForm = { email: '', password: '', role: 'user', is_active: true }

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const usersQuery = useQuery({ queryKey: ['gestionale-users'], queryFn: fetchGestionaleUsers })
  const saveMutation = useMutation({
    mutationFn: ({ mode, id, payload }) => mode === 'create' ? createGestionaleUser(payload) : updateGestionaleUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestionale-users'] })
      setEditing(null)
      setForm(emptyForm)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteGestionaleUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestionale-users'] })
      setDeleteTarget(null)
    },
  })

  function openCreate() {
    setForm(emptyForm)
    setEditing({ mode: 'create' })
  }

  function openEdit(user) {
    setEditing({ mode: 'edit', user })
    setForm({ email: user.email || '', password: '', role: user.role || 'user', is_active: user.is_active !== false })
  }

  function save(e) {
    e.preventDefault()
    saveMutation.mutate({
      mode: editing.mode,
      id: editing.user?.id,
      payload: {
        ...form,
        current_email: editing.user?.email || form.email,
      },
    })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Permessi gestionale</div>
          <h2 className="dashboard-hero__title">Utenti Nova</h2>
          <p className="dashboard-hero__text">L’admin può creare nuovi accessi, cambiare email, password e ruolo oppure eliminare definitivamente un account.</p>
        </div>
        <button className="topbar__button topbar__button--primary" type="button" onClick={openCreate}><Plus size={17} /> Nuovo utente</button>
      </div>

      <div className="page-card">
        {usersQuery.isLoading ? <p>Caricamento utenti…</p> : null}
        {usersQuery.error ? <p className="form-error">Errore: {usersQuery.error.message}</p> : null}
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th>Azioni</th></tr></thead>
            <tbody>
              {(usersQuery.data || []).map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.email}</strong>{user.is_current ? <span className="nova-pill nova-pill--ok admin-user-current-pill">Tu</span> : null}<br /><small>{user.id}</small></td>
                  <td><span className={user.role === 'admin' ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{user.role || 'user'}</span></td>
                  <td>{user.is_active !== false ? 'Attivo' : 'Disattivato'}</td>
                  <td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('it-IT') : 'Mai'}</td>
                  <td><div className="rowActions"><button className="actionBtn" onClick={() => openEdit(user)}><UserCog size={15} /> Modifica</button><button className="actionBtn admin-user-delete-btn" disabled={user.is_current} onClick={() => setDeleteTarget(user)}><Trash2 size={15} /> Elimina</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="modalOverlay" onClick={() => setEditing(null)}>
          <div className="modalCard admin-user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-user-modal__hero">
              <div className="admin-user-modal__identity">
                <div className="admin-user-modal__icon"><ShieldCheck size={24} /></div>
                <div><div className="dashboard-hero__eyebrow">{editing.mode === 'create' ? 'Nuovo accesso' : 'Gestione accesso'}</div><h3>{editing.mode === 'create' ? 'Crea utente' : 'Modifica utente'}</h3><p>{editing.mode === 'create' ? 'Crea direttamente l’account Auth e il profilo Nova.' : editing.user.email}</p></div>
              </div>
              <button className="package-editor-close" type="button" onClick={() => setEditing(null)}><X size={20} /></button>
            </div>

            <form className="formGrid admin-user-form" onSubmit={save}>
              <div className="admin-user-form__intro"><Sparkles size={18} /><span>La password resta privata e viene inviata direttamente al backend protetto di Nova.</span></div>
              <label className="admin-user-field">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
              <label className="admin-user-field">{editing.mode === 'create' ? 'Password iniziale' : 'Nuova password (facoltativa)'}<input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={editing.mode === 'create'} placeholder={editing.mode === 'edit' ? 'Lascia vuoto per non cambiarla' : 'Minimo 6 caratteri'} /></label>
              <label className="admin-user-field">Ruolo<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="user">Utente normale</option></select></label>
              <label className="check-card admin-user-check-card"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span>Utente attivo</span><small>Se disattivato non potrà accedere al gestionale.</small></label>
              {saveMutation.error ? <p className="form-error">{saveMutation.error.message}</p> : null}
              <div className="modalActions"><button type="button" className="topbar__button" onClick={() => setEditing(null)}>Annulla</button><button className="topbar__button topbar__button--primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Salvataggio…' : editing.mode === 'create' ? 'Crea utente' : 'Salva modifiche'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modalOverlay" onClick={() => setDeleteTarget(null)}>
          <div className="modalCard admin-user-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="packages-confirm-icon"><Trash2 size={24} /></div><h3>Eliminare questo utente?</h3><p>L’account <strong>{deleteTarget.email}</strong> verrà eliminato da Nova e da Supabase Auth. L’operazione è definitiva.</p>
            {deleteMutation.error ? <p className="form-error">{deleteMutation.error.message}</p> : null}
            <div className="modalActions"><button className="topbar__button" type="button" onClick={() => setDeleteTarget(null)}>Annulla</button><button className="topbar__button packages-danger-primary" type="button" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Elimino…' : 'Elimina utente'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
