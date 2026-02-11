import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function AdminUsers({ token, user }) {
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);

  // Create user form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');

  // UI
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset password modal
  const [pwModal, setPwModal] = useState({
    open: false,
    email: '',
    tempPassword: '',
    copied: false
  });

  function toastSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  }

  async function loadUsers() {
    setError('');
    setLoading(true);
    try {
      const res = await api.adminListUsers(token);
      setUsers(res.users || []);
    } catch (e) {
      setError(e.message || 'Errore caricamento utenti');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      `${u.email} ${u.role} ${(u.is_active ?? u.isActive ?? u.active) === false ? 'disabled' : 'active'}` .toLowerCase().includes(q)
    );
  }, [users, search]);

  const canCreate = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6;
  }, [email, password]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.adminCreateUser(token, {
        email: email.trim(),
        password,
        role
      });

      setEmail('');
      setPassword('');
      setRole('user');

      toastSuccess('Utente creato correttamente.');
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Errore creazione utente');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Eliminare l'utente "${u.email}"?`)) return;

    setError('');
    setSuccess('');
    setBusyId(u.id);

    try {
      await api.adminDeleteUser(token, u.id);
      toastSuccess('Utente eliminato.');
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Errore eliminazione utente');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisable(u) {
    if (u.id === user.id) return;
    if (!confirm(`Disattivare l'utente "${u.email}"?`)) return;

    setError('');
    setSuccess('');
    setBusyId(u.id);

    try {
      await api.adminDisableUser(token, u.id);
      toastSuccess('Utente disattivato.');
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Errore disattivazione utente');
    } finally {
      setBusyId(null);
    }
  }

  async function handleEnable(u) {
    setError('');
    setSuccess('');
    setBusyId(u.id);

    try {
      await api.adminEnableUser(token, u.id);
      toastSuccess('Utente riattivato.');
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Errore riattivazione utente');
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(u) {
    if (!confirm(`Resettare la password per "${u.email}"?\nVerrà generata una password temporanea.`)) return;

    setError('');
    setSuccess('');
    setBusyId(u.id);

    try {
      const res = await api.adminResetPassword(token, u.id); // backend: genera temp password
      const tempPassword = res?.tempPassword;

      // Mostra modale SOLO se il backend ha restituito la password temporanea
      if (tempPassword) {
        setPwModal({
          open: true,
          email: u.email,
          tempPassword,
          copied: false
        });
      } else {
        toastSuccess('Password aggiornata.');
      }

      await loadUsers();
    } catch (e) {
      setError(e.message || 'Errore reset password');
    } finally {
      setBusyId(null);
    }
  }

  async function copyTempPassword() {
    try {
      await navigator.clipboard.writeText(pwModal.tempPassword);
      setPwModal(prev => ({ ...prev, copied: true }));
      setTimeout(() => setPwModal(prev => ({ ...prev, copied: false })), 1500);
    } catch {
      // fallback
      alert('Copia non disponibile. Seleziona e copia manualmente.');
    }
  }

  function closePwModal() {
    setPwModal({ open: false, email: '', tempPassword: '', copied: false });
  }

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel-title">Utenti</div>
        <div className="error">Accesso negato: solo admin.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Utenti</h2>
          <p>Solo admin: crea utenti, disattiva accessi e resetta password.</p>
        </div>

        <div className="page-actions">
          <button className="btn" type="button" onClick={loadUsers} disabled={loading}>
            {loading ? 'Caricamento…' : 'Ricarica'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Create */}
      <div className="panel">
        <div className="panel-title">Crea nuovo utente</div>

        <form className="toolbar toolbar-wrap" onSubmit={handleCreate}>
          <div className="toolbar-row">
            <div className="toolbar-group" style={{ flex: 1 }}>
              <label>
                Email
                <input
                  type="email"
                  placeholder="utente@azienda.it"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="toolbar-group" style={{ flex: 1 }}>
              <label>
                Password
                <input
                  type="password"
                  placeholder="Min 6 caratteri"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                Ruolo
                <select value={role} onChange={e => setRole(e.target.value)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>

            <div className="toolbar-buttons">
              <button className="btn btn-primary" type="submit" disabled={!canCreate || loading}>
                Crea utente
              </button>
            </div>
          </div>
        </form>

        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
          Suggerimento: tieni pochi admin. Per bloccare un accesso usa “Disattiva” invece di eliminare.
        </div>
      </div>

      {/* List */}
      <div className="panel">
        <div className="panel-title">Lista utenti</div>

        <div className="toolbar">
          <input
            type="text"
            placeholder="Cerca per email / ruolo / stato…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th className="nowrap">Ruolo</th>
                <th className="nowrap">Stato</th>
                <th className="nowrap">Azioni</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(u => {
                const active =
                  (u.is_active ?? u.isActive ?? u.active); // supporta più nomi possibili
                const disabled = (active === false); // SOLO se è esplicitamente false

                const isSelf = u.id === user.id;
                const isBusy = busyId === u.id;

                return (
                  <tr key={u.id} style={disabled ? { opacity: 0.72 } : undefined}>
                    <td>
                      <strong>{u.email}</strong>
                      {isSelf && <span className="pill pill-blue" style={{ marginLeft: 8 }}>tu</span>}
                    </td>

                    <td className="nowrap">
                      <span className={`pill ${u.role === 'admin' ? 'pill-blue' : ''}`}>
                        {u.role}
                      </span>
                    </td>

                    <td className="nowrap">
                      {disabled ? (
                        <span className="pill pill-red">disattivo</span>
                      ) : (
                        <span className="pill pill-green">attivo</span>
                      )}
                    </td>

                    <td className="nowrap">
                      <div className="row-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => handleResetPassword(u)}
                          disabled={isBusy}
                          title="Genera password temporanea"
                        >
                          Reset PW
                        </button>

                        {u.is_active ? (
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={() => handleDisable(u)}
                            disabled={isBusy || isSelf}
                            title={isSelf ? 'Non puoi disattivare te stesso' : 'Disattiva accesso'}
                          >
                            Disattiva
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => handleEnable(u)}
                            disabled={isBusy}
                            title="Riattiva accesso"
                          >
                            Riattiva
                          </button>
                        )}

                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={isBusy || isSelf}
                          title={isSelf ? 'Non puoi eliminare te stesso' : 'Elimina utente'}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="4">Nessun utente</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
          Totale: <strong>{users.length}</strong> — Visualizzati: <strong>{filtered.length}</strong>
        </div>
      </div>

      {/* Modal password */}
      {pwModal.open && (
        <div className="modal-backdrop" onMouseDown={closePwModal}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <p style={{ marginBottom: 10 }}>
              Password temporanea per <strong>{pwModal.email}</strong>:
            </p>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'rgba(248,250,252,0.9)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
                wordBreak: 'break-all'
              }}
            >
              {pwModal.tempPassword}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn" type="button" onClick={copyTempPassword}>
                {pwModal.copied ? 'Copiata ✅' : 'Copia'}
              </button>
              <button className="btn btn-primary" type="button" onClick={closePwModal}>
                Chiudi
              </button>
            </div>

            <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
              Copiala ora: non verrà mostrata di nuovo (se non con un nuovo reset).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
