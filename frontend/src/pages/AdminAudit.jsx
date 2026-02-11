import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT');
  } catch {
    return iso || '-';
  }
}

function safeJsonString(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? '');
  }
}

export default function AdminAudit({ token, user }) {
  const isAdmin = user?.role === 'admin';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [limit, setLimit] = useState(200);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const [metaModal, setMetaModal] = useState({ open: false, title: '', content: '' });

  function toastSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 2500);
  }

  async function loadAudit(customLimit) {
    setError('');
    setLoading(true);
    try {
      const res = await api.adminListAudit(token, customLimit ?? limit);
      setLogs(res.logs || []);
      toastSuccess('Audit aggiornato.');
    } catch (e) {
      setError(e.message || 'Errore caricamento audit log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadAudit(limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const actions = useMemo(() => {
    const set = new Set((logs || []).map(l => l.action).filter(Boolean));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs || []).filter(l => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (!q) return true;

      const blob = [
        l.action,
        l.actor_user_id,
        l.target_user_id,
        l.ip,
        l.user_agent,
        safeJsonString(l.meta)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return blob.includes(q);
    });
  }, [logs, search, actionFilter]);

  function openMeta(log) {
    setMetaModal({
      open: true,
      title: `${log.action} • ${formatDateTime(log.created_at)}`,
      content: safeJsonString(log.meta)
    });
  }

  function closeMeta() {
    setMetaModal({ open: false, title: '', content: '' });
  }

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel-title">Audit Log</div>
        <div className="error">Accesso negato: solo admin.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Audit Log</h2>
          <p>Traccia le azioni amministrative (creazioni utenti, reset password, disattivazioni…).</p>
        </div>

        <div className="page-actions">
          <button className="btn" type="button" onClick={() => loadAudit(limit)} disabled={loading}>
            {loading ? 'Caricamento…' : 'Ricarica'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="panel">
        <div className="panel-title">Filtri</div>

        <div className="toolbar toolbar-wrap">
          <div className="toolbar-row">
            <div className="toolbar-group" style={{ flex: 1 }}>
              <label>
                Cerca
                <input
                  type="text"
                  placeholder="Cerca per action / actor / target / ip / meta…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                Azione
                <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                  <option value="">Tutte</option>
                  {actions.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                Limite
                <select
                  value={limit}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setLimit(v);
                    loadAudit(v);
                  }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </label>
            </div>

            <div className="toolbar-buttons">
              <button className="btn btn-primary" type="button" onClick={() => loadAudit(limit)} disabled={loading}>
                Applica
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSearch('');
                  setActionFilter('');
                }}
              >
                Reset filtri
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Eventi <span className="muted-inline">(visualizzati {filtered.length})</span>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th className="nowrap">Data</th>
                <th className="nowrap">Azione</th>
                <th className="nowrap">Actor</th>
                <th className="nowrap">Target</th>
                <th className="nowrap">IP</th>
                <th>User Agent</th>
                <th className="nowrap">Meta</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(log => (
                <tr key={log.id}>
                  <td className="nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="nowrap">
                    <span className="pill pill-blue">{log.action}</span>
                  </td>
                  <td className="nowrap">
                    <span className="pill">{log.actor_user_id || '-'}</span>
                  </td>
                  <td className="nowrap">
                    <span className="pill">{log.target_user_id || '-'}</span>
                  </td>
                  <td className="nowrap">{log.ip || '-'}</td>
                  <td style={{ maxWidth: 420 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {log.user_agent ? String(log.user_agent).slice(0, 160) : '-'}
                      {log.user_agent && String(log.user_agent).length > 160 ? '…' : ''}
                    </span>
                  </td>
                  <td className="nowrap">
                    <button className="btn" type="button" onClick={() => openMeta(log)}>
                      Vedi
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7">Nessun evento</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {metaModal.open && (
        <div className="modal-backdrop" onMouseDown={closeMeta}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <p style={{ marginBottom: 10 }}>
              <strong>{metaModal.title}</strong>
            </p>

            <pre
              style={{
                margin: 0,
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'rgba(248,250,252,0.9)',
                maxHeight: 320,
                overflow: 'auto',
                fontSize: 12
              }}
            >
{metaModal.content}
            </pre>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-primary" type="button" onClick={closeMeta}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
