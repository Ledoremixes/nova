import React, { useMemo, useState } from "react";

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

/* ================================
   MODALE SOLO CONFERMA (NO PROGRESS)
   Il progress “vero” lo gestisce Entries.jsx
   ================================ */
function BulkConfirmModal({
  open,
  selectedCount,
  title,
  subtitle,
  onCancel,
  onApplySelected,
  onApplyAll,
}) {
  if (!open) return null;

  return (
    <div className="progress-backdrop" onMouseDown={onCancel}>
      <div
        className="progress-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="progress-modal__top">
          <div className="progress-modal__head">
            <div style={{ minWidth: 0 }}>
              <h3 className="progress-modal__title">{title}</h3>
              {subtitle ? <p className="progress-modal__subtitle">{subtitle}</p> : null}
            </div>

            <button
              type="button"
              className="progress-modal__close"
              onClick={onCancel}
              aria-label="Chiudi"
              title="Chiudi"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="progress-modal__body">
          <div className="progress-status">
            <div className="progress-pill is-running">
              <span className="progress-pill__dot" />
              <span>Conferma</span>
            </div>

            <div className="progress-meta">
              <div>
                Selezionate: <strong>{selectedCount}</strong>
              </div>
            </div>
          </div>

          <div className="progress-card">
            <div className="progress-row">
              <div className="progress-label">{subtitle}</div>
            </div>
          </div>
        </div>

        <div className="progress-modal__footer">
          <button type="button" className="progress-btn primary" onClick={onApplySelected}>
            Solo righe selezionate
          </button>
          <button type="button" className="progress-btn" onClick={onApplyAll}>
            Tutte le righe della ricerca
          </button>
          <button type="button" className="progress-btn danger" onClick={onCancel}>
            Annulla
          </button>
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
  onUpdateDescription,
}) {
  const [editedNature, setEditedNature] = useState({});
  const [editedAccount, setEditedAccount] = useState({});
  const [selectedIds, setSelectedIds] = useState({});

  const [activeRowId, setActiveRowId] = useState(null);

  // inline edit descrizione
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // modal solo conferma
  const [confirm, setConfirm] = useState({
    open: false,
    selectedIds: [],
    accountCode: "",
    nature: "",
  });

  function handleNatureChange(id, value) {
    setEditedNature((prev) => ({ ...prev, [id]: value }));
  }

  function handleAccountChange(id, value) {
    setEditedAccount((prev) => ({ ...prev, [id]: value }));
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleSelectAll() {
    const allSelected = entries.length > 0 && entries.every((e) => selectedIds[e.id]);
    if (allSelected) {
      setSelectedIds({});
    } else {
      const next = {};
      entries.forEach((e) => (next[e.id] = true));
      setSelectedIds(next);
    }
  }

  function getSelectedIdsArray() {
    return entries.map((e) => e.id).filter((id) => selectedIds[id]);
  }

  const allSelected = entries.length > 0 && entries.every((e) => selectedIds[e.id]);
  const selectedCount = useMemo(() => getSelectedIdsArray().length, [entries, selectedIds]);

  function clearSelection() {
    setSelectedIds({});
  }

  function handleSaveClick(id, accountCode, nature) {
    const selected = getSelectedIdsArray();
    const isMulti = selected.length > 1 && selected.includes(id);

    if (isMulti) {
      // apri SOLO conferma, poi il progress lo farà Entries.jsx
      setConfirm({
        open: true,
        selectedIds: selected,
        accountCode,
        nature,
      });
      return;
    }

    onUpdateMeta(id, accountCode, nature);
  }

  // testo descrittivo modal conferma
  const confirmSubtitle = useMemo(() => {
    const parts = [];
    if (confirm.accountCode) parts.push(`conto "${confirm.accountCode}"`);
    if (confirm.nature) {
      const naturaLabel =
        confirm.nature === "commerciale"
          ? 'natura "Commerciale"'
          : confirm.nature === "istituzionale"
          ? 'natura "Istituzionale"'
          : `natura "${confirm.nature}"`;
      parts.push(naturaLabel);
    }

    if (parts.length === 0) {
      return `Vuoi aggiornare le ${confirm.selectedIds.length} voci selezionate o tutte le voci trovate con questa ricerca?`;
    }
    return `Vuoi applicare ${parts.join(" e ")} alle ${confirm.selectedIds.length} voci selezionate o a tutte le voci della ricerca corrente?`;
  }, [confirm.accountCode, confirm.nature, confirm.selectedIds.length]);

  function closeConfirm() {
    setConfirm((prev) => ({ ...prev, open: false }));
  }

  async function applySelected() {
    const { selectedIds, accountCode, nature } = confirm;
    closeConfirm(); // ✅ chiudo subito (evito “doppio modale”)
    await onUpdateMetaBulk(selectedIds, accountCode, nature); // ✅ qui si aprirà il ProgressModal di Entries.jsx
  }

  async function applyAll() {
    const { accountCode, nature } = confirm;
    closeConfirm();
    if (onUpdateMetaBulkAll) {
      await onUpdateMetaBulkAll(accountCode, nature); // ✅ ProgressModal di Entries.jsx
    } else {
      await onUpdateMetaBulk(confirm.selectedIds, accountCode, nature);
    }
  }

  function startEditDescription(entry) {
    setEditingId(entry.id);
    setEditingValue((entry.description ?? "").toString());
    setActiveRowId(entry.id);
  }

  function cancelEditDescription() {
    setEditingId(null);
    setEditingValue("");
  }

  async function saveEditDescription(entry) {
    const next = (editingValue ?? "").trim();
    if (!onUpdateDescription) {
      cancelEditDescription();
      return;
    }
    await onUpdateDescription(entry.id, next);
    cancelEditDescription();
  }

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
          {entries.map((e) => {
            const currentNature =
              editedNature[e.id] !== undefined ? editedNature[e.id] : e.nature || "";

            const currentAccount =
              editedAccount[e.id] !== undefined ? editedAccount[e.id] : e.account_code || "";

            const vatRate = e.vat_rate != null ? Number(e.vat_rate) : null;
            const vatAmount = e.vat_amount != null ? Number(e.vat_amount) : null;

            const selected = !!selectedIds[e.id];
            const active = activeRowId === e.id;
            const editing = editingId === e.id;

            return (
              <tr
                key={e.id}
                className={`${selected ? "row-selected" : ""} ${active ? "row-active" : ""}`}
                onClick={() => setActiveRowId(e.id)}
              >
                <td onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" checked={selected} onChange={() => toggleSelect(e.id)} />
                </td>

                <td className="nowrap">{new Date(e.date).toLocaleDateString("it-IT")}</td>

                <td className="td-desc">
                  {!editing ? (
                    <div className="desc-line">
                      <div className="desc-main">{e.description}</div>

                      <button
                        type="button"
                        className={`icon-btn ${active ? "show" : ""}`}
                        title="Modifica descrizione"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          startEditDescription(e);
                        }}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="desc-edit" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        className="input"
                        value={editingValue}
                        onChange={(ev) => setEditingValue(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Escape") cancelEditDescription();
                          if (ev.key === "Enter") saveEditDescription(e);
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
                  <span className={Number(e.amount_in || 0) > 0 ? "amount-in" : ""}>
                    {Number(e.amount_in || 0).toFixed(2)}
                  </span>
                </td>

                <td className="num">
                  <span className={Number(e.amount_out || 0) > 0 ? "amount-out" : ""}>
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

                <td className="nowrap" onClick={(ev) => ev.stopPropagation()}>
                  <select value={currentAccount} onChange={(ev) => handleAccountChange(e.id, ev.target.value)}>
                    <option value="">—</option>
                    {accounts.map((a) => (
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

                <td className="nowrap" onClick={(ev) => ev.stopPropagation()}>
                  <select value={currentNature} onChange={(ev) => handleNatureChange(e.id, ev.target.value)}>
                    <option value="">—</option>
                    <option value="istituzionale">Istituzionale</option>
                    <option value="commerciale">Commerciale</option>
                  </select>
                </td>

                <td className="nowrap" onClick={(ev) => ev.stopPropagation()}>
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
                        if (confirm("Eliminare questo movimento?")) onDelete(e.id);
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

      {/* ✅ SOLO conferma: niente running/progress qui */}
      <BulkConfirmModal
        open={confirm.open}
        selectedCount={confirm.selectedIds.length}
        title="Conferma aggiornamento"
        subtitle={confirmSubtitle}
        onCancel={closeConfirm}
        onApplySelected={applySelected}
        onApplyAll={applyAll}
      />
    </>
  );
}
