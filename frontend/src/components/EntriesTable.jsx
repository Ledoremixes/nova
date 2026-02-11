import React, { useEffect, useMemo, useState } from 'react';

function PencilIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const FUN_MESSAGES = [
  'Sto aggiornando i movimenti… 💾',
  'Sto parlando con Supabase… 🤝',
  'Allineo i conti e le nature… ⚙️',
  'Quasi fatto, non chiudere… ✨',
  'Ultimi ritocchi… 🔥',
];

/* ================================
   MODALE BULK - versione "premium"
   Usa le classi progress-* (stesso stile del nuovo)
   ================================ */
function BulkProgressModal({
  open,
  phase, // confirm | running | success | error
  title,
  subtitle,
  selectedCount,
  progress,
  msgIndex,
  error,
  onClose,
  onCancel,
  onApplySelected,
  onApplyAll,
}) {
  if (!open) return null;

  const isRunning = phase === 'running';
  const isSuccess = phase === 'success';
  const isError = phase === 'error';
  const isConfirm = phase === 'confirm';

  const pct = Math.max(0, Math.min(100, Math.round(progress || 0)));

  const statusLabel = isSuccess ? 'Completato' : isError ? 'Errore' : isRunning ? 'Operazione in corso' : 'Conferma';
  const pillClass = isSuccess
    ? 'progress-pill is-success'
    : isError
    ? 'progress-pill is-error'
    : 'progress-pill is-running';

  const rightText = isRunning
    ? FUN_MESSAGES[msgIndex || 0]
    : isSuccess
    ? 'Fatto! ✅'
    : isError
    ? 'Errore ⚠️'
    : '';

  return (
    <div className="progress-backdrop" onMouseDown={isRunning ? undefined : onCancel}>
      <div className="progress-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="progress-modal__top">
          <div className="progress-modal__head">
            <div style={{ minWidth: 0 }}>
              <h3 className="progress-modal__title">{title}</h3>
              {subtitle ? <p className="progress-modal__subtitle">{subtitle}</p> : null}
            </div>

            <button
              type="button"
              className="progress-modal__close"
              onClick={isRunning ? undefined : onCancel}
              disabled={isRunning}
              aria-label="Chiudi"
              title={isRunning ? 'Attendi il completamento' : 'Chiudi'}
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
              {isConfirm ? (
                <div>Selezionate: <strong>{selectedCount}</strong></div>
              ) : (
                <>
                  <div>Avanzamento <strong>{pct}%</strong></div>
                  <div>Selezionate: <strong>{selectedCount}</strong></div>
                </>
              )}
              {rightText ? <div>{rightText}</div> : null}
            </div>
          </div>

          {(isRunning || isSuccess || isError) && (
            <div className="progress-card">
              <div className="progress-row">
                <div className="progress-label">
                  {isSuccess ? 'Operazione completata' : isError ? 'Operazione interrotta' : 'Aggiornamento in corso…'}
                </div>
                <div className="progress-value">
                  <strong>{pct}%</strong>
                </div>
              </div>

              <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
                <div className="progress-glow" style={{ left: `${pct}%` }} />
              </div>

              {isError && error ? <div className="progress-error">{error}</div> : null}
            </div>
          )}
        </div>

        <div className="progress-modal__footer">
          {isConfirm && (
            <>
              <button type="button" className="progress-btn primary" onClick={onApplySelected}>
                Solo righe selezionate
              </button>
              <button type="button" className="progress-btn" onClick={onApplyAll}>
                Tutte le righe della ricerca
              </button>
              <button type="button" className="progress-btn danger" onClick={onCancel}>
                Annulla
              </button>
            </>
          )}

          {isRunning && (
            <>
              <button type="button" className="progress-btn" disabled>
                Applicazione in corso…
              </button>
              <button type="button" className="progress-btn" disabled>
                Attendere…
              </button>
              <button type="button" className="progress-btn danger" disabled>
                Annulla
              </button>
            </>
          )}

          {(isSuccess || isError) && (
            <button type="button" className="progress-btn primary" onClick={onClose}>
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EntriesTable({
  entries,
  accounts,
  onDelete,
  onUpdateMeta,
  onUpdateMetaBulk,
  onUpdateMetaBulkAll,
  onUpdateDescription
}) {
  const [editedNature, setEditedNature] = useState({});
  const [editedAccount, setEditedAccount] = useState({});
  const [selectedIds, setSelectedIds] = useState({});

  // ✅ riga attiva per mostrare la matita
  const [activeRowId, setActiveRowId] = useState(null);

  // ✅ inline edit descrizione
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const [modal, setModal] = useState({
    open: false,
    selectedCount: 0,
    selectedIds: [],
    accountCode: '',
    nature: '',
    phase: 'confirm', // confirm | running | success | error
    progress: 0,      // 0..100 (finto ma “smooth”)
    msgIndex: 0,
    error: ''
  });

  function handleNatureChange(id, value) {
    setEditedNature(prev => ({ ...prev, [id]: value }));
  }

  function handleAccountChange(id, value) {
    setEditedAccount(prev => ({ ...prev, [id]: value }));
  }

  function toggleSelect(id) {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectAll() {
    const allSelected = entries.length > 0 && entries.every(e => selectedIds[e.id]);
    if (allSelected) {
      setSelectedIds({});
    } else {
      const next = {};
      entries.forEach(e => (next[e.id] = true));
      setSelectedIds(next);
    }
  }

  function getSelectedIdsArray() {
    return entries.map(e => e.id).filter(id => selectedIds[id]);
  }

  const allSelected = entries.length > 0 && entries.every(e => selectedIds[e.id]);
  const selectedCount = useMemo(() => getSelectedIdsArray().length, [entries, selectedIds]);

  function clearSelection() {
    setSelectedIds({});
  }

  function handleSaveClick(id, accountCode, nature) {
    const selected = getSelectedIdsArray();
    const isMulti = selected.length > 1 && selected.includes(id);

    if (isMulti) {
      setModal({
        open: true,
        selectedCount: selected.length,
        selectedIds: selected,
        accountCode,
        nature,
        phase: 'confirm',
        progress: 0,
        msgIndex: 0,
        error: ''
      });
      return;
    }

    onUpdateMeta(id, accountCode, nature);
  }

  // ✅ progress “smooth” (fake) finché la request è in running
  useEffect(() => {
    if (!modal.open) return;
    if (modal.phase !== 'running') return;

    let stopped = false;

    const progressId = setInterval(() => {
      if (stopped) return;
      setModal(prev => {
        if (prev.phase !== 'running') return prev;
        const bump = Math.random() * 6 + 2; // 2..8
        const next = Math.min(92, (prev.progress || 0) + bump);
        return { ...prev, progress: next };
      });
    }, 650);

    const msgId = setInterval(() => {
      if (stopped) return;
      setModal(prev => {
        if (!prev.open) return prev;
        return { ...prev, msgIndex: (prev.msgIndex + 1) % FUN_MESSAGES.length };
      });
    }, 1700);

    return () => {
      stopped = true;
      clearInterval(progressId);
      clearInterval(msgId);
    };
  }, [modal.open, modal.phase]);

  async function runBulk(action) {
    setModal(prev => ({ ...prev, phase: 'running', progress: 6, error: '' }));

    try {
      await action();
      setModal(prev => ({ ...prev, progress: 100, phase: 'success' }));
    } catch (err) {
      const msg =
        err?.message ||
        (typeof err === 'string' ? err : '') ||
        'Errore durante l’aggiornamento.';

      setModal(prev => ({
        ...prev,
        phase: 'error',
        error: msg,
        progress: Math.max(12, prev.progress || 0)
      }));
    }
  }

  async function handleModalApplySelected() {
    const { selectedIds, accountCode, nature } = modal;
    await runBulk(async () => {
      await onUpdateMetaBulk(selectedIds, accountCode, nature);
    });
  }

  async function handleModalApplyAll() {
    const { accountCode, nature } = modal;
    await runBulk(async () => {
      if (onUpdateMetaBulkAll) {
        await onUpdateMetaBulkAll(accountCode, nature);
      } else {
        await onUpdateMetaBulk(modal.selectedIds, accountCode, nature);
      }
    });
  }

  function handleModalCancel() {
    if (modal.phase === 'running') return;
    setModal(prev => ({ ...prev, open: false }));
  }

  function handleModalClose() {
    setModal(prev => ({ ...prev, open: false }));
  }

  // ✅ descrizione popup
  let modalDescr = '';
  const parts = [];
  if (modal.accountCode) parts.push(`conto "${modal.accountCode}"`);
  if (modal.nature) {
    const naturaLabel =
      modal.nature === 'commerciale'
        ? 'natura "Commerciale"'
        : modal.nature === 'istituzionale'
        ? 'natura "Istituzionale"'
        : `natura "${modal.nature}"`;
    parts.push(naturaLabel);
  }
  if (parts.length === 0) {
    modalDescr = `Vuoi aggiornare le ${modal.selectedCount} voci selezionate o tutte le voci trovate con questa ricerca?`;
  } else {
    modalDescr = `Vuoi applicare ${parts.join(' e ')} alle ${modal.selectedCount} voci selezionate o a tutte le voci della ricerca corrente?`;
  }

  function startEditDescription(entry) {
    setEditingId(entry.id);
    setEditingValue((entry.description ?? '').toString());
    setActiveRowId(entry.id);
  }

  function cancelEditDescription() {
    setEditingId(null);
    setEditingValue('');
  }

  async function saveEditDescription(entry) {
    const next = (editingValue ?? '').trim();
    if (!onUpdateDescription) {
      cancelEditDescription();
      return;
    }
    await onUpdateDescription(entry.id, next);
    cancelEditDescription();
  }

  const modalTitle = useMemo(() => {
    if (modal.phase === 'running') return 'Aggiornamento in corso';
    if (modal.phase === 'success') return 'Aggiornamento completato';
    if (modal.phase === 'error') return 'Ops… qualcosa è andato storto';
    return 'Conferma aggiornamento';
  }, [modal.phase]);

  const modalSubtitle = useMemo(() => {
    const descr = modalDescr;
    if (modal.phase === 'running') return 'Non chiudere questa finestra: sto applicando le modifiche nel database.';
    if (modal.phase === 'success') return 'Le modifiche sono state applicate correttamente.';
    if (modal.phase === 'error') return 'Puoi chiudere e riprovare. Se continua, controlliamo la query.';
    return descr;
  }, [modal.phase, modalDescr]);

  return (
    <>
      {selectedCount > 0 && (
        <div className="bulkbar">
          <div className="bulkbar-left">
            <span className="pill pill-blue">
              Selezionati: <strong style={{ marginLeft: 6 }}>{selectedCount}</strong>
            </span>
            <button className="btn" type="button" onClick={clearSelection}>
              Deseleziona
            </button>
          </div>

          <div className="bulkbar-right">
            <span className="bulkbar-hint">
              Suggerimento: cambia conto/natura su una riga selezionata e premi “Salva”.
            </span>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th className="nowrap">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            </th>
            <th className="nowrap">Data</th>
            <th>Descrizione</th>
            <th className="num nowrap">Entrata</th>
            <th className="num nowrap">Uscita</th>
            <th className="num nowrap">IVA %</th>
            <th className="num nowrap">IVA</th>
            <th className="nowrap">Conto</th>
            <th className="nowrap">Metodo</th>
            <th className="nowrap">Centro</th>
            <th className="nowrap">Natura</th>
            <th className="nowrap">Azioni</th>
          </tr>
        </thead>

        <tbody>
          {entries.map(e => {
            const currentNature =
              editedNature[e.id] !== undefined ? editedNature[e.id] : e.nature || '';

            const currentAccount =
              editedAccount[e.id] !== undefined ? editedAccount[e.id] : e.account_code || '';

            const vatRate = e.vat_rate != null ? Number(e.vat_rate) : null;
            const vatAmount = e.vat_amount != null ? Number(e.vat_amount) : null;

            const selected = !!selectedIds[e.id];
            const active = activeRowId === e.id;
            const editing = editingId === e.id;

            return (
              <tr
                key={e.id}
                className={`${selected ? 'row-selected' : ''} ${active ? 'row-active' : ''}`}
                onClick={() => setActiveRowId(e.id)}
              >
                <td onClick={ev => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(e.id)}
                  />
                </td>

                <td className="nowrap">
                  {new Date(e.date).toLocaleDateString('it-IT')}
                </td>

                <td className="td-desc">
                  {!editing ? (
                    <div className="desc-line">
                      <div className="desc-main">{e.description}</div>

                      <button
                        type="button"
                        className={`icon-btn ${active ? 'show' : ''}`}
                        title="Modifica descrizione"
                        onClick={ev => {
                          ev.stopPropagation();
                          startEditDescription(e);
                        }}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="desc-edit" onClick={ev => ev.stopPropagation()}>
                      <input
                        className="input"
                        value={editingValue}
                        onChange={ev => setEditingValue(ev.target.value)}
                        onKeyDown={ev => {
                          if (ev.key === 'Escape') cancelEditDescription();
                          if (ev.key === 'Enter') saveEditDescription(e);
                        }}
                        autoFocus
                      />

                      <button
                        type="button"
                        className="icon-btn show"
                        title="Salva"
                        onClick={() => saveEditDescription(e)}
                      >
                        <CheckIcon />
                      </button>

                      <button
                        type="button"
                        className="icon-btn show"
                        title="Annulla"
                        onClick={cancelEditDescription}
                      >
                        <XIcon />
                      </button>
                    </div>
                  )}

                  {e.note && <div className="desc-sub">{e.note}</div>}
                </td>

                <td className="num">
                  <span className={Number(e.amount_in || 0) > 0 ? 'amount-in' : ''}>
                    {Number(e.amount_in || 0).toFixed(2)}
                  </span>
                </td>

                <td className="num">
                  <span className={Number(e.amount_out || 0) > 0 ? 'amount-out' : ''}>
                    {Number(e.amount_out || 0).toFixed(2)}
                  </span>
                </td>

                <td className="num nowrap">
                  {vatRate != null ? (
                    <span className="pill">{vatRate.toFixed(2)}%</span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>

                <td className="num">
                  {vatAmount != null ? vatAmount.toFixed(2) : <span className="muted">-</span>}
                </td>

                <td className="nowrap" onClick={ev => ev.stopPropagation()}>
                  <select
                    value={currentAccount}
                    onChange={ev => handleAccountChange(e.id, ev.target.value)}
                  >
                    <option value="">—</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.code}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="nowrap">
                  {e.method ? <span className="pill">{e.method}</span> : <span className="muted">-</span>}
                </td>

                <td className="nowrap">
                  {e.center ? <span className="pill">{e.center}</span> : <span className="muted">-</span>}
                </td>

                <td className="nowrap" onClick={ev => ev.stopPropagation()}>
                  <select
                    value={currentNature}
                    onChange={ev => handleNatureChange(e.id, ev.target.value)}
                  >
                    <option value="">—</option>
                    <option value="istituzionale">Istituzionale</option>
                    <option value="commerciale">Commerciale</option>
                  </select>
                </td>

                <td className="nowrap" onClick={ev => ev.stopPropagation()}>
                  <div className="row-actions">
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => handleSaveClick(e.id, currentAccount, currentNature)}
                      title="Salva metadati (conto/natura)"
                    >
                      Salva
                    </button>

                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => {
                        if (confirm('Eliminare questo movimento?')) onDelete(e.id);
                      }}
                      title="Elimina movimento"
                    >
                      Elimina
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {entries.length === 0 && (
            <tr>
              <td colSpan="12">Nessun movimento</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ✅ nuovo modale bulk coerente con la grafica */}
      <BulkProgressModal
        open={modal.open}
        phase={modal.phase}
        title={modalTitle}
        subtitle={modalSubtitle}
        selectedCount={modal.selectedCount}
        progress={modal.progress}
        msgIndex={modal.msgIndex}
        error={modal.error}
        onClose={handleModalClose}
        onCancel={handleModalCancel}
        onApplySelected={handleModalApplySelected}
        onApplyAll={handleModalApplyAll}
      />
    </>
  );
}
