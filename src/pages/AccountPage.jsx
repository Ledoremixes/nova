import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Save, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { fetchAccountProfile, updateOwnEmail, updateOwnPassword, upsertAccountProfile } from '../api/account'

export default function AccountPage() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ full_name: '', phone: '', notification_email: '' })
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')

  const profileQuery = useQuery({
    queryKey: ['account-profile', user?.id],
    queryFn: () => fetchAccountProfile(user.id),
    enabled: Boolean(user?.id),
  })

  useEffect(() => {
    const data = profileQuery.data
    setForm({
      full_name: data?.full_name || '',
      phone: data?.phone || '',
      notification_email: data?.notification_email || user?.email || '',
    })
    setNewEmail(user?.email || '')
  }, [profileQuery.data, user?.email])

  const saveProfileMutation = useMutation({
    mutationFn: () => upsertAccountProfile(user.id, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-profile', user?.id] }),
  })

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (password !== password2) throw new Error('Le password non coincidono.')
      return updateOwnPassword(password)
    },
    onSuccess: () => {
      setPassword('')
      setPassword2('')
    },
  })

  const emailMutation = useMutation({ mutationFn: () => updateOwnEmail(newEmail) })

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Profilo personale</div>
          <h2 className="dashboard-hero__title">Account</h2>
          <p className="dashboard-hero__text">Gestisci i tuoi dati personali, email e password. Disponibile anche per utenti non admin.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="page-card">
          <div className="section-head"><div><h3>Dati profilo</h3><p>{user?.email}</p></div><ShieldCheck /></div>
          <div className="formGrid">
            <label>Nome visualizzato<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
            <label>Telefono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>Email notifiche<input type="email" value={form.notification_email} onChange={(e) => setForm({ ...form, notification_email: e.target.value })} /></label>
            <label>Ruolo<input value={profile?.role || 'user'} disabled /></label>
          </div>
          {saveProfileMutation.error ? <p className="form-error">{saveProfileMutation.error.message}</p> : null}
          {saveProfileMutation.isSuccess ? <p className="success-text">Profilo salvato.</p> : null}
          <button className="topbar__button topbar__button--primary" onClick={() => saveProfileMutation.mutate()}><Save size={16} /> Salva profilo</button>
        </div>

        <div className="page-card">
          <div className="section-head"><div><h3>Sicurezza</h3><p>Modifica credenziali di accesso.</p></div><Mail /></div>
          <div className="formGrid">
            <label>Nuova email<input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
            <label>Nuova password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label>Ripeti password<input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} /></label>
          </div>
          {emailMutation.error ? <p className="form-error">{emailMutation.error.message}</p> : null}
          {passwordMutation.error ? <p className="form-error">{passwordMutation.error.message}</p> : null}
          {emailMutation.isSuccess ? <p className="success-text">Controlla la casella email per confermare il cambio indirizzo.</p> : null}
          {passwordMutation.isSuccess ? <p className="success-text">Password aggiornata.</p> : null}
          <div className="rowActions"><button className="topbar__button" onClick={() => emailMutation.mutate()}>Aggiorna email</button><button className="topbar__button topbar__button--primary" onClick={() => passwordMutation.mutate()}>Aggiorna password</button></div>
        </div>
      </div>
    </section>
  )
}
