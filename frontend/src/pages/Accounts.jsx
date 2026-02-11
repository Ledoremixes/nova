import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function Accounts({ token }) {
  const [accounts, setAccounts] = useState([]);

  const [search, setSearch] = useState('');

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('entrata');

  const [editingId, setEditingId] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('entrata');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function showSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  async function load() {
    try {
      setError('');
      const data = await api.getAccounts(token);
      setAccounts(data || []);
    } catch (err) {
      setError(err.message || 'Errore caricamento conti');
    }
  }

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      `${a.code} ${a.name} ${a.type}`.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      setError('');
      await api.createAccount(token, {
        code: newCode.trim(),
        name: newName.trim(),
        type: newType
      });
      setNewCode('');
      setNewName('');
      setNewType('entrata');
      await load();
      showSuccess('Conto creato correttamente.');
    } catch (err) {
      setError(err.message || 'Errore creazione conto');
    }
  }

  function startEdit(account) {
    setError('');
    setEditingId(account.id);
    setEditCode(account.code);
    setEditName(account.name);
    setEditType(account.type || 'entrata');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCode('');
    setEditName('');
    setEditType('entrata');
  }

  async function saveEdit(id) {
    try {
      setError('');
      await api.updateAccount(token, id, {
        code: editCode.trim(),
        name: editName.trim(),
        type: editType
      });
      await load();
      showSuccess('Conto aggiornato.');
      cancelEdit();
    } catch (err) {
      setError(err.message || 'Errore aggiornamento conto');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Eliminare questo conto?')) return;
    try {
      setError('');
      await api.deleteAccount(token, id);
      await load();
      showSuccess('Conto eliminato.');
    } catch (err) {
      setError(err.message || 'Errore eliminazione conto');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Conti</h2>
          <p>Gestisci i conti di entrata/uscita (codice, descrizione e tipo).</p>
        </div>

        <div className="page-actions">
          <button className="btn" type="button" onClick={load}>
            Ricarica
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Nuovo conto */}
      <div className="panel">
        <div className="panel-title">Nuovo conto</div>

        <form className="toolbar toolbar-wrap" onSubmit={handleCreate}>
          <div className="toolbar-row">
            <div className="toolbar-group">
              <label>
                Codice
                <input
                  type="text"
                  placeholder="Es: BAR"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="toolbar-group" style={{ flex: 1 }}>
              <label>
                Nome
                <input
                  type="text"
                  placeholder="Es: Incasso Bar"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                Tipo
                <select value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="entrata">Entrata</option>
                  <option value="uscita">Uscita</option>
                </select>
              </label>
            </div>

            <div className="toolbar-buttons">
              <button className="btn btn-primary" type="submit">
                Salva
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Elenco */}
      <div className="panel">
        <div className="panel-title">Elenco conti</div>

        <div className="toolbar">
          <input
            type="text"
            placeholder="Cerca per codice o nome…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th className="nowrap">Codice</th>
                <th>Nome</th>
                <th className="nowrap">Tipo</th>
                <th className="nowrap">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(acc => {
                const isEditing = editingId === acc.id;

                return (
                  <tr key={acc.id}>
                    <td className="nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCode}
                          onChange={e => setEditCode(e.target.value)}
                        />
                      ) : (
                        <strong>{acc.code}</strong>
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          style={{ width: '100%' }}
                        />
                      ) : (
                        acc.name
                      )}
                    </td>

                    <td className="nowrap">
                      {isEditing ? (
                        <select
                          value={editType}
                          onChange={e => setEditType(e.target.value)}
                        >
                          <option value="entrata">entrata</option>
                          <option value="uscita">uscita</option>
                        </select>
                      ) : (
                        <span
                          className={`pill ${acc.type === 'uscita' ? 'pill-red' : 'pill-green'}`}
                        >
                          {acc.type}
                        </span>
                      )}
                    </td>

                    <td className="nowrap">
                      {isEditing ? (
                        <div className="row-actions">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => saveEdit(acc.id)}
                            title="Salva"
                          >
                            Salva
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={cancelEdit}
                            title="Annulla"
                          >
                            Annulla
                          </button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          <button
                            className="btn"
                            type="button"
                            onClick={() => startEdit(acc)}
                            title="Modifica"
                          >
                            Modifica
                          </button>
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={() => handleDelete(acc.id)}
                            title="Elimina"
                          >
                            Elimina
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="4">Nessun conto trovato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
          Totale conti: <strong>{accounts.length}</strong> — Visualizzati: <strong>{filtered.length}</strong>
        </div>
      </div>
    </div>
  );
}
