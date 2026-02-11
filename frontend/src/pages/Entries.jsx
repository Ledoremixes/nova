import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import EntryForm from '../components/EntryForm';
import EntriesTable from '../components/EntriesTable';
import ImportSumup from '../components/ImportSumup';
import "../styles/entries.css";

const PAGE_SIZE = 100;

// ✅ LocalStorage key per salvare l’ultima data import
const LAST_IMPORT_KEY = 'gest:lastExcelImport';

function readLastImport() {
  try {
    const raw = localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.at) return null;
    const d = new Date(obj.at);
    if (isNaN(d.getTime())) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeLastImport(payload) {
  try {
    localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function formatItDateTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

// ===== Progress Modal (inline) =====
function ProgressModal({
  open,
  title,
  subtitle,
  status,       // 'running' | 'success' | 'error'
  percent,      // 0..100
  selectedCount,
  detailRight,
  canCancel,
  canClose,
  errorText,
  onCancel,
  onClose
}) {
  if (!open) return null;

  const statusLabel =
    status === 'success' ? 'Completato' :
    status === 'error' ? 'Errore' :
    'Operazione in corso';

  const pillClass =
    status === 'success' ? 'progress-pill is-success' :
    status === 'error' ? 'progress-pill is-error' :
    'progress-pill is-running';

  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  return (
    <div className="progress-backdrop">
      <div className="progress-modal" role="dialog" aria-modal="true">
        <div className="progress-modal__top">
          <div className="progress-modal__head">
            <div style={{ minWidth: 0 }}>
              <h3 className="progress-modal__title">{title}</h3>
              {subtitle ? <p className="progress-modal__subtitle">{subtitle}</p> : null}
            </div>

            {/* X: chiudibile solo se canClose */}
            <button
              type="button"
              className="progress-modal__close"
              onClick={onClose}
              disabled={!canClose}
              aria-label="Chiudi"
              title={canClose ? 'Chiudi' : 'Non chiudere durante l’operazione'}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="progress-modal__body">
          <div className="progress-status">
            <div className={pillClass}>
              <span className="progress-pill__dot" />
              <span>{statusLabel}</span>
            </div>

            <div className="progress-meta">
              <div>Avanzamento <strong>{pct}%</strong></div>
              {selectedCount != null ? (
                <div>Selezionate: <strong>{selectedCount}</strong></div>
              ) : null}
              {detailRight ? <div>{detailRight}</div> : null}
            </div>
          </div>

          <div className="progress-card">
            <div className="progress-row">
              <div className="progress-label">
                {status === 'success' ? 'Operazione completata' : status === 'error' ? 'Operazione interrotta' : 'Aggiornamento in corso…'}
              </div>
              <div className="progress-value">
                <strong>{pct}%</strong>
              </div>
            </div>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
              <div className="progress-glow" style={{ left: `${pct}%` }} />
            </div>

            {errorText ? <div className="progress-error">{errorText}</div> : null}
          </div>
        </div>

        <div className="progress-modal__footer">
          {canCancel ? (
            <button type="button" className="progress-btn danger" onClick={onCancel}>
              Annulla
            </button>
          ) : null}

          {canClose ? (
            <button type="button" className="progress-btn primary" onClick={onClose}>
              Chiudi
            </button>
          ) : (
            <button type="button" className="progress-btn" disabled>
              Applicazione in corso…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Entries({ token }) {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');

  const [withoutAccount, setWithoutAccount] = useState(false);
  const [accountFilter, setAccountFilter] = useState('');
  const [vatFilter, setVatFilter] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ✅ stato: ultimo import excel (letto da localStorage)
  const [lastExcelImport, setLastExcelImport] = useState(() => readLastImport());

  // ✅ Progress modal state
  const [pmOpen, setPmOpen] = useState(false);
  const [pmTitle, setPmTitle] = useState('Aggiornamento in corso');
  const [pmSubtitle, setPmSubtitle] = useState('Non chiudere questa finestra: sto applicando le modifiche nel database.');
  const [pmStatus, setPmStatus] = useState('running'); // running | success | error
  const [pmPercent, setPmPercent] = useState(0);
  const [pmSelected, setPmSelected] = useState(null);
  const [pmDetailRight, setPmDetailRight] = useState('');
  const [pmErrorText, setPmErrorText] = useState('');
  const [pmCanCancel, setPmCanCancel] = useState(true);
  const [pmCanClose, setPmCanClose] = useState(false);

  const cancelRef = useRef(false);

  function openProgressModal({ title, subtitle, selectedCount }) {
    cancelRef.current = false;
    setPmTitle(title || 'Aggiornamento in corso');
    setPmSubtitle(subtitle || 'Non chiudere questa finestra: sto applicando le modifiche nel database.');
    setPmStatus('running');
    setPmPercent(0);
    setPmSelected(selectedCount ?? null);
    setPmDetailRight('');
    setPmErrorText('');
    setPmCanCancel(true);
    setPmCanClose(false);
    setPmOpen(true);
  }

  function setProgress(pct, detailRight) {
    setPmPercent(pct);
    if (detailRight !== undefined) setPmDetailRight(detailRight);
  }

  function finishProgressSuccess(detailRight) {
    setPmStatus('success');
    setPmPercent(100);
    if (detailRight) setPmDetailRight(detailRight);
    setPmCanCancel(false);
    setPmCanClose(true);
  }

  function finishProgressError(msg) {
    setPmStatus('error');
    setPmErrorText(msg || 'Errore durante l’operazione.');
    setPmCanCancel(false);
    setPmCanClose(true);
  }

  function closeProgressModal() {
    setPmOpen(false);
  }

  function cancelProgressModal() {
    // Interrompe i loop: non cancella le chiamate già partite, ma blocca le successive
    cancelRef.current = true;
    setPmCanCancel(false);
    setPmDetailRight('Interruzione richiesta…');
  }

  const shownCountLabel = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE + (entries.length ? 1 : 0);
    const end = (page - 1) * PAGE_SIZE + entries.length;
    return entries.length ? `${start}–${end}` : '0';
  }, [entries.length, page]);

  function showSuccess(msg) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  }

  function buildRange() {
    let from = null;
    let to = null;

    if (fromDate) {
      const time = fromTime || '00:00';
      from = `${fromDate}T${time}:00`;
    }
    if (toDate) {
      const time = toTime || '23:59';
      to = `${toDate}T${time}:59`;
    }

    return { from, to };
  }

  async function load(customSearch, customPage) {
    try {
      setError('');
      setLoading(true);

      const { from, to } = buildRange();
      const currentPage = customPage ?? page;

      const res = await api.getEntries(token, {
        search: customSearch ?? search,
        from,
        to,
        withoutAccount,
        accountCode: withoutAccount ? undefined : accountFilter || undefined,
        vatRate: vatFilter || undefined,
        page: currentPage,
        pageSize: PAGE_SIZE
      });

      setEntries(res.items || []);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Errore caricamento movimenti');
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const data = await api.getAccounts(token);
      setAccounts(data || []);
    } catch (err) {
      console.error('Errore caricamento conti:', err);
    }
  }

  useEffect(() => {
    load('', 1);
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSave(form) {
    try {
      setError('');
      await api.createEntry(token, form);
      await load(undefined, 1);
      showSuccess('Movimento salvato correttamente.');
    } catch (err) {
      setError(err.message || 'Errore salvataggio movimento');
    }
  }

  async function handleDelete(id) {
    try {
      setError('');
      await api.deleteEntry(token, id);
      await load();
      showSuccess('Movimento eliminato.');
    } catch (err) {
      setError(err.message || 'Errore eliminazione movimento');
    }
  }

  async function handleUpdateMeta(id, accountCode, nature) {
    try {
      setError('');
      await api.updateEntryMeta(token, id, {
        accountCode: accountCode || null,
        nature: nature || null
      });
      await load();
      showSuccess('Movimento aggiornato correttamente.');
    } catch (err) {
      setError(err.message || 'Errore aggiornamento movimento');
    }
  }

  async function handleUpdateMetaBulk(ids, accountCode, nature) {
    // ✅ Ora mostra progress modal “bello”
    const selectedCount = Array.isArray(ids) ? ids.length : 0;

    openProgressModal({
      title: 'Aggiornamento in corso',
      subtitle: 'Non chiudere questa finestra: sto applicando le modifiche nel database.',
      selectedCount
    });

    try {
      setError('');
      setPmSelected(selectedCount);

      // loop aggiornamenti con progress
      const total = selectedCount || 1;
      let done = 0;

      for (const id of ids) {
        if (cancelRef.current) {
          finishProgressError('Operazione annullata dall’utente.');
          return;
        }

        const body = {};
        if (accountCode !== undefined) body.accountCode = accountCode || null;
        if (nature !== undefined) body.nature = nature || null;

        await api.updateEntryMeta(token, id, body);

        done += 1;
        const pct = Math.round((done / total) * 100);
        setProgress(pct, `Aggiornati ${done}/${total}`);
      }

      await load();

      let msg = `Movimenti aggiornati: ${ids.length}.`;
      if (accountCode && nature) {
        const naturaLabel =
          nature === 'commerciale'
            ? 'Commerciale'
            : nature === 'istituzionale'
            ? 'Istituzionale'
            : nature;
        msg = `Conto "${accountCode}" e natura "${naturaLabel}" assegnati a ${ids.length} movimenti.`;
      } else if (accountCode) {
        msg = `Conto "${accountCode}" assegnato a ${ids.length} movimenti.`;
      } else if (nature) {
        const naturaLabel =
          nature === 'commerciale'
            ? 'Commerciale'
            : nature === 'istituzionale'
            ? 'Istituzionale'
            : nature;
        msg = `Natura "${naturaLabel}" assegnata a ${ids.length} movimenti.`;
      }

      showSuccess(msg);
      finishProgressSuccess('Operazione completata ✅');
    } catch (err) {
      setError(err.message || 'Errore aggiornamento massivo');
      finishProgressError(err.message || 'Errore aggiornamento massivo');
    }
  }

  async function handleUpdateMetaBulkAll(accountCode, nature) {
    openProgressModal({
      title: 'Aggiornamento su tutte le righe',
      subtitle: 'Sto raccogliendo tutte le righe in base ai filtri e applicando le modifiche nel database.',
      selectedCount: null
    });

    try {
      setError('');
      const { from, to } = buildRange();

      const baseFilters = {
        search,
        from,
        to,
        withoutAccount,
        accountCode: withoutAccount ? undefined : accountFilter || undefined,
        vatRate: vatFilter || undefined
      };

      const BULK_PAGE_SIZE = 500;
      let currentPage = 1;
      let allIds = [];

      // fase 1: raccolta ID
      while (true) {
        if (cancelRef.current) {
          finishProgressError('Operazione annullata dall’utente.');
          return;
        }

        const res = await api.getEntries(token, {
          ...baseFilters,
          page: currentPage,
          pageSize: BULK_PAGE_SIZE
        });

        const items = res.items || [];
        if (items.length === 0) break;

        allIds = allIds.concat(items.map(e => e.id));

        const tp = res.totalPages || 1;
        // progress “raccolta”: max 25% della barra
        const pctCollect = Math.min(25, Math.round((currentPage / tp) * 25));
        setProgress(pctCollect, `Raccolta righe… pagina ${currentPage}/${tp}`);

        if (currentPage >= tp) break;
        currentPage += 1;
      }

      if (allIds.length === 0) {
        finishProgressSuccess('Nessuna riga trovata ✅');
        return;
      }

      setPmSelected(allIds.length);
      setProgress(25, `Trovate ${allIds.length} righe. Avvio aggiornamento…`);

      // fase 2: aggiornamento con progress (dal 25% al 100%)
      const total = allIds.length;
      let done = 0;

      for (const id of allIds) {
        if (cancelRef.current) {
          finishProgressError('Operazione annullata dall’utente.');
          return;
        }

        const body = {};
        if (accountCode !== undefined) body.accountCode = accountCode || null;
        if (nature !== undefined) body.nature = nature || null;

        await api.updateEntryMeta(token, id, body);

        done += 1;
        const pct = 25 + Math.round((done / total) * 75);
        setProgress(pct, `Aggiornati ${done}/${total}`);
      }

      await load();
      showSuccess(`Modifiche applicate correttamente a ${allIds.length} movimenti.`);
      finishProgressSuccess('Operazione completata ✅');
    } catch (err) {
      setError(err.message || 'Errore aggiornamento su tutte le righe');
      finishProgressError(err.message || 'Errore aggiornamento su tutte le righe');
    }
  }

  // ✅ Update descrizione (usata dalla "matita" in EntriesTable)
  async function handleUpdateDescription(id, description) {
    try {
      setError('');
      await api.updateEntryMeta(token, id, {
        description: (description ?? '').trim()
      });
      await load();
      showSuccess('Descrizione aggiornata correttamente.');
    } catch (err) {
      setError(err.message || 'Errore aggiornamento descrizione');
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load(undefined, 1);
  }

  function handleSearchChange(e) {
    const value = e.target.value;
    setSearch(value);
    if (value === '') {
      setPage(1);
      load('', 1);
    }
  }

  function handleResetFilters() {
    setSearch('');
    setFromDate('');
    setFromTime('');
    setToDate('');
    setToTime('');
    setWithoutAccount(false);
    setAccountFilter('');
    setVatFilter('');
    setPage(1);
    load('', 1);
  }

  function handleToggleWithoutAccount(e) {
    const checked = e.target.checked;
    setWithoutAccount(checked);
    if (checked) setAccountFilter('');
    setPage(1);
    setTimeout(() => load('', 1), 0);
  }

  function handleAccountFilterChange(e) {
    const val = e.target.value;
    setAccountFilter(val);
    setPage(1);
    setTimeout(() => load('', 1), 0);
  }

  function handleVatFilterChange(e) {
    const val = e.target.value;
    setVatFilter(val);
    setPage(1);
    setTimeout(() => load('', 1), 0);
  }

  function goToPage(newPage) {
    const p = Math.min(Math.max(1, newPage), totalPages);
    setPage(p);
    load(undefined, p);
  }

  return (
    <div className="entries-page">

      {/* ✅ Progress modal bello (serve anche per bulk all/selected) */}
      <ProgressModal
        open={pmOpen}
        title={pmTitle}
        subtitle={pmSubtitle}
        status={pmStatus}
        percent={pmPercent}
        selectedCount={pmSelected}
        detailRight={pmDetailRight}
        canCancel={pmCanCancel && pmStatus === 'running'}
        canClose={pmCanClose}
        errorText={pmStatus === 'error' ? pmErrorText : ''}
        onCancel={cancelProgressModal}
        onClose={closeProgressModal}
      />

      <div className="page-header">
        <div className="page-title">
          <h2>Prima nota</h2>
          <p>Filtra, importa e classifica i movimenti con conto, IVA e natura.</p>
        </div>

        <div className="page-actions">
          <button
            className="btn"
            type="button"
            onClick={() => load(undefined, 1)}
            disabled={loading}
          >
            {loading ? 'Caricamento…' : 'Ricarica'}
          </button>
        </div>
      </div>

      {/* Messaggi globali */}
      {error && <div className="error">{error}</div>}
      {successMessage && <div className="success">{successMessage}</div>}

      {/* Filtri + import */}
      <div className="panel">
        <div className="panel-title">Filtri e import</div>

        <form className="toolbar toolbar-wrap" onSubmit={handleSearchSubmit}>
          <div className="toolbar-row">
            <label style={{ width: '100%' }}>
              Ricerca
              <input
                type="text"
                placeholder="Cerca per descrizione…"
                value={search}
                onChange={handleSearchChange}
              />
            </label>
          </div>

          <div className="toolbar-row">
            <div className="toolbar-group">
              <label>
                Da data
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                />
              </label>
              <label>
                Ora
                <input
                  type="time"
                  value={fromTime}
                  onChange={e => setFromTime(e.target.value)}
                />
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                A data
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                />
              </label>
              <label>
                Ora
                <input
                  type="time"
                  value={toTime}
                  onChange={e => setToTime(e.target.value)}
                />
              </label>
            </div>

            <div className="toolbar-group">
              <label className="switch-field-compact">
                Filtro
                <div className="switch-row">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={withoutAccount}
                      onChange={handleToggleWithoutAccount}
                    />
                    <span className="slider" />
                  </label>
                  <span className="switch-label">Solo senza conto</span>
                </div>
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                Conto
                <select
                  value={accountFilter}
                  onChange={handleAccountFilterChange}
                  disabled={withoutAccount}
                >
                  <option value="">Tutti</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.code}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="toolbar-group">
              <label>
                IVA
                <select value={vatFilter} onChange={handleVatFilterChange}>
                  <option value="">Tutte</option>
                  <option value="0">0%</option>
                  <option value="4">4%</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="22">22%</option>
                </select>
              </label>
            </div>

            <div className="toolbar-buttons">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                Cerca
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleResetFilters}
                disabled={loading}
              >
                Reset
              </button>
            </div>
          </div>
        </form>

        {/* ✅ Etichetta ultimo import */}
        <div className="muted" style={{ marginTop: 10 }}>
          Ultimo import Excel:{' '}
          <strong>
            {lastExcelImport?.at ? formatItDateTime(lastExcelImport.at) : '—'}
          </strong>
          {lastExcelImport?.file ? (
            <span className="muted"> • file: {lastExcelImport.file}</span>
          ) : null}
        </div>

        <div className="import-section">
          <ImportSumup
            token={token}
            onImported={(meta) => {
              const payload = {
                at: new Date().toISOString(),
                file: meta?.fileName || meta?.file || null
              };
              writeLastImport(payload);
              setLastExcelImport(payload);

              setPage(1);
              load('', 1);
            }}
          />
        </div>
      </div>

      {/* Nuovo movimento */}
      <div className="panel">
        <div className="panel-title">Nuovo movimento</div>
        <EntryForm onSave={handleSave} accounts={accounts} />
      </div>

      {/* Tabella movimenti */}
      <div className="panel">
        <div className="panel-title">
          Elenco movimenti{' '}
          <span className="muted-inline">
            (mostrati {shownCountLabel} • pagina {page}/{totalPages})
          </span>
        </div>

        <div className="table-wrapper">
          <EntriesTable
            entries={entries}
            accounts={accounts}
            onDelete={handleDelete}
            onUpdateMeta={handleUpdateMeta}
            onUpdateMetaBulk={handleUpdateMetaBulk}
            onUpdateMetaBulkAll={handleUpdateMetaBulkAll}
            onUpdateDescription={handleUpdateDescription}
          />
        </div>

        <div className="pagination">
          <button
            className="btn"
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
          >
            ‹ Prec
          </button>

          <span>
            Pagina <strong>{page}</strong> di <strong>{totalPages}</strong>
          </span>

          <button
            className="btn"
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading}
          >
            Succ ›
          </button>
        </div>
      </div>
    </div>
  );
}
