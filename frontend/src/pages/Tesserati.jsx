import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/Tesserati.css";
import * as XLSX from "xlsx";
import { api } from "../api";

// ---------------- Helpers ----------------
function safeStr(v) {
  return (v ?? "").toString().trim();
}

function normalizeCF(cf) {
  const s = safeStr(cf).toUpperCase().replace(/\s+/g, "");
  return s || "";
}

function cfKey(cf) {
  const n = normalizeCF(cf);
  return n.length ? n : "";
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function mapExcelRow(row) {
  // colonne del tuo file:
  // Nome, Cognome, Cod. fiscale, Cellulare, Residente in via, Città, Email, Tipo, Anno 25/26, Pagamento, Note
  const nome = safeStr(row["Nome"] || row["NOME"]);
  const cognome = safeStr(row["Cognome"] || row["COGNOME"]);
  const cod_fiscale = normalizeCF(
    row["Cod. fiscale"] ||
      row["Codice Fiscale"] ||
      row["COD. FISCALE"] ||
      row["Codice fiscale"] ||
      row["CF"]
  );
  const cellulare = safeStr(row["Cellulare"] || row["Telefono"] || row["CELLULARE"]);
  const indirizzo = safeStr(row["Residente in via"] || row["Indirizzo"] || row["VIA"]);
  const citta = safeStr(row["Città"] || row["Citta"] || row["CITTA"]);
  const email = safeStr(row["Email"] || row["E-mail"] || row["EMAIL"]).toLowerCase();
  const tipo = safeStr(row["Tipo"] || row["TIPO"] || "Tesserato");
  const anno = safeStr(row["Anno 25/26"] || row["Anno"] || row["ANNO"] || "25/26");
  const pagamento = safeStr(row["Pagamento"] || row["PAGAMENTO"] || "");
  const note = safeStr(row["Note"] || row["NOTE"] || "");

  return {
    _tmp_id: uid(), // solo UI
    nome,
    cognome,
    cod_fiscale: cod_fiscale || "", // NON obbligatorio
    cellulare,
    indirizzo,
    citta,
    email,
    tipo,
    anno,
    pagamento,
    note,
  };
}

function isRowFullyEmpty(r) {
  return (
    !safeStr(r.nome) &&
    !safeStr(r.cognome) &&
    !safeStr(r.cod_fiscale) &&
    !safeStr(r.cellulare) &&
    !safeStr(r.email) &&
    !safeStr(r.indirizzo) &&
    !safeStr(r.citta) &&
    !safeStr(r.tipo) &&
    !safeStr(r.anno) &&
    !safeStr(r.pagamento) &&
    !safeStr(r.note)
  );
}

// ---------------- Component ----------------
export default function Tesserati({ token, user }) {
  const isAdmin = !!(user?.is_admin || user?.role === "admin");

  // lista
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // toast
  const [toast, setToast] = useState({ type: "", msg: "" });
  function showToast(type, msg) {
    setToast({ type, msg });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast({ type: "", msg: "" }), 3200);
  }

  // ricerca / filtri
  const [q, setQ] = useState("");
  const [filterTipo, setFilterTipo] = useState("Tutti");
  const [filterAnno, setFilterAnno] = useState("Tutti");
  const [filterPay, setFilterPay] = useState("Tutti");

  // modale create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // profilo
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileItem, setProfileItem] = useState(null);

  // import excel
  const fileRef = useRef(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStage, setImportStage] = useState("");
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 }); // per barra

  const [importRows, setImportRows] = useState([]); // righe pronte
  const [conflicts, setConflicts] = useState([]); // [{incoming, existing}]
  const [conflictChoice, setConflictChoice] = useState({}); // existingId -> overwrite|insert|skip
  const [conflictNewCF, setConflictNewCF] = useState({}); // existingId -> newCF
  const [importStats, setImportStats] = useState({
    total: 0,
    valid: 0,
    invalid: 0, // solo righe totalmente vuote
    duplicatesInFile: 0,
    conflicts: 0,
  });

  // ---------------- Load list ----------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const list = await api.getTesserati(token);
        if (!mounted) return;
        setItems(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        showToast("error", e.message || "Errore caricamento tesserati.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  // dropdown filtri
  const tipoOptions = useMemo(() => {
    const set = new Set(items.map((x) => x.tipo).filter(Boolean));
    return ["Tutti", ...Array.from(set).sort()];
  }, [items]);

  const annoOptions = useMemo(() => {
    const set = new Set(items.map((x) => x.anno).filter(Boolean));
    return ["Tutti", ...Array.from(set).sort()];
  }, [items]);

  const payOptions = useMemo(() => {
    const set = new Set(items.map((x) => x.pagamento).filter(Boolean));
    return ["Tutti", ...Array.from(set).sort()];
  }, [items]);

  // filtrati
  const filtered = useMemo(() => {
    const qq = q.toLowerCase().trim();
    return items
      .filter((x) => {
        if (filterTipo !== "Tutti" && x.tipo !== filterTipo) return false;
        if (filterAnno !== "Tutti" && x.anno !== filterAnno) return false;
        if (filterPay !== "Tutti" && x.pagamento !== filterPay) return false;
        if (!qq) return true;

        const blob = `${x.nome} ${x.cognome} ${x.cod_fiscale} ${x.cellulare} ${x.email} ${x.citta} ${x.indirizzo} ${x.tipo} ${x.anno} ${x.pagamento} ${x.note}`.toLowerCase();
        return blob.includes(qq);
      })
      .sort(
        (a, b) =>
          (a.cognome || "").localeCompare(b.cognome || "") ||
          (a.nome || "").localeCompare(b.nome || "")
      );
  }, [items, q, filterTipo, filterAnno, filterPay]);

  // ---------------- CRUD ----------------
  async function upsertTesserato(payload) {
    if (payload.__isNew) {
      const created = await api.createTesserato(token, payload);
      setItems((prev) => [created, ...prev]);
      return created;
    } else {
      const updated = await api.updateTesserato(token, payload.id, payload);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      return updated;
    }
  }

  async function deleteTesserato(id) {
    if (!confirm("Eliminare questo tesserato?")) return;
    try {
      await api.deleteTesserato(token, id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      showToast("ok", "Eliminato.");
    } catch (e) {
      console.error(e);
      showToast("error", e.message || "Errore eliminazione.");
    }
  }

  function openNew() {
    setEditing({
      __isNew: true,
      nome: "",
      cognome: "",
      cod_fiscale: "",
      cellulare: "",
      email: "",
      indirizzo: "",
      citta: "",
      tipo: "Tesserato",
      anno: "25/26",
      pagamento: "",
      note: "",
    });
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing({ ...item, __isNew: false });
    setModalOpen(true);
  }

  function openProfile(item) {
    setProfileItem(item);
    setProfileOpen(true);
  }

  async function saveEditing() {
    try {
      const nome = safeStr(editing?.nome);
      const cognome = safeStr(editing?.cognome);
      if (!nome || !cognome) {
        showToast("error", "Nome e Cognome sono obbligatori.");
        return;
      }

      const cf = normalizeCF(editing?.cod_fiscale);
      const payload = {
        ...editing,
        nome,
        cognome,
        cod_fiscale: cf || null, // CF non obbligatorio
        email: safeStr(editing?.email).toLowerCase() || null,
        cellulare: safeStr(editing?.cellulare) || null,
        indirizzo: safeStr(editing?.indirizzo) || null,
        citta: safeStr(editing?.citta) || null,
        tipo: safeStr(editing?.tipo) || "Tesserato",
        anno: safeStr(editing?.anno) || "25/26",
        pagamento: safeStr(editing?.pagamento) || null,
        note: safeStr(editing?.note) || null,
      };

      // controllo duplicati CF lato UI SOLO se CF valorizzato
      if (payload.cod_fiscale) {
        const duplicate = items.find(
          (x) => normalizeCF(x.cod_fiscale) === payload.cod_fiscale && x.id !== payload.id
        );
        if (duplicate) {
          showToast(
            "error",
            `CF già presente: ${duplicate.cognome} ${duplicate.nome} (${duplicate.cellulare || "no cell"})`
          );
          return;
        }
      }

      await upsertTesserato(payload);
      setModalOpen(false);
      setEditing(null);
      showToast("ok", payload.__isNew ? "Tesserato creato." : "Tesserato aggiornato.");
    } catch (e) {
      console.error(e);
      showToast("error", e.message || "Errore salvataggio.");
    }
  }

  // ---------------- Import Excel ----------------
  function pickExcel() {
    fileRef.current?.click();
  }

  function resetImportState() {
    setImportRows([]);
    setConflicts([]);
    setConflictChoice({});
    setConflictNewCF({});
    setImportStats({ total: 0, valid: 0, invalid: 0, duplicatesInFile: 0, conflicts: 0 });
    setImportProgress({ done: 0, total: 0 });
    setImportStage("");
  }

  async function handleFile(file) {
    if (!file) return;

    resetImportState();
    setImportOpen(true);
    setImportLoading(true);
    setImportStage("Leggo il file Excel…");

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const sheetName =
        wb.SheetNames.find((n) => n.toLowerCase().includes("tesserati")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      setImportStage("Preparo i dati…");

      const mapped = rows.map(mapExcelRow);

      // scarto SOLO righe totalmente vuote
      let invalid = 0;
      const cleaned = [];
      for (const r of mapped) {
        if (isRowFullyEmpty(r)) {
          invalid++;
          continue;
        }
        cleaned.push(r);
      }

      // dedup SOLO per CF dentro lo stesso file (se CF valorizzato)
      const seen = new Set();
      let duplicatesInFile = 0;
      const valid = [];

      for (const r of cleaned) {
        const key = cfKey(r.cod_fiscale);
        if (key) {
          if (seen.has(key)) {
            duplicatesInFile++;
            continue; // tengo la prima occorrenza
          }
          seen.add(key);
        }
        valid.push({
          ...r,
          cod_fiscale: key || null, // null se vuoto
        });
      }

      setImportRows(valid);
      setImportStats({
        total: mapped.length,
        valid: valid.length,
        invalid,
        duplicatesInFile,
        conflicts: 0,
      });

      // preview duplicati su server SOLO per righe con CF
      const rowsWithCF = valid.filter((r) => !!r.cod_fiscale);
      if (rowsWithCF.length === 0) {
        setImportStage("Nessun CF nel file: nessun controllo duplicati necessario.");
        setConflicts([]);
        setImportStats((s) => ({ ...s, conflicts: 0 }));
        showToast("ok", `File letto: ${valid.length} righe pronte all’import.`);
        return;
      }

      setImportStage("Controllo CF già presenti sul server…");
      const CHUNK = 200;
      let conflictsFromServer = [];

      setImportProgress({ done: 0, total: rowsWithCF.length });

      for (let i = 0; i < rowsWithCF.length; i += CHUNK) {
        const slice = rowsWithCF.slice(i, i + CHUNK);
        setImportStage(`Controllo sul server… (${Math.min(i + CHUNK, rowsWithCF.length)}/${rowsWithCF.length})`);

        const previewPart = await api.previewImportTesserati(token, slice);
        const partConflicts = Array.isArray(previewPart?.conflicts) ? previewPart.conflicts : [];
        conflictsFromServer = conflictsFromServer.concat(partConflicts);

        setImportProgress({ done: Math.min(i + CHUNK, rowsWithCF.length), total: rowsWithCF.length });
      }

      // dedup conflitti per existing.id (per evitare ripetizioni)
      const byId = new Map();
      for (const c of conflictsFromServer) {
        const id = c?.existing?.id;
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, c);
      }
      const uniqueConflicts = Array.from(byId.values());

      setConflicts(uniqueConflicts);
      setImportStats((s) => ({ ...s, conflicts: uniqueConflicts.length }));

      // default: overwrite
      const defChoice = {};
      for (const c of uniqueConflicts) {
        const exId = c?.existing?.id;
        if (exId) defChoice[exId] = "overwrite";
      }
      setConflictChoice(defChoice);

      showToast("ok", `File letto: ${valid.length} righe pronte. Duplicati su server: ${uniqueConflicts.length}.`);
    } catch (e) {
      console.error(e);
      showToast("error", e.message || "Errore lettura Excel.");
      setImportOpen(false);
      resetImportState();
    } finally {
      setImportLoading(false);
      setImportStage("");
      setImportProgress({ done: 0, total: 0 });
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setChoice(existingId, val) {
    setConflictChoice((prev) => ({ ...prev, [existingId]: val }));
  }

  function setNewCf(existingId, val) {
    setConflictNewCF((prev) => ({ ...prev, [existingId]: val }));
  }

  function canConfirmImport() {
    // se hai scelto "insert" su qualche conflitto, devi aver messo un CF nuovo valido
    for (const c of conflicts) {
      const exId = c?.existing?.id;
      if (!exId) continue;
      if ((conflictChoice[exId] || "overwrite") === "insert") {
        const v = normalizeCF(conflictNewCF[exId]);
        if (!v) return false;
      }
    }
    return importRows.length > 0;
  }

  async function confirmImport() {
    if (!importRows.length) {
      showToast("warn", "Nessuna riga da importare.");
      return;
    }

    try {
      setImportBusy(true);
      setImportStage("Preparo le azioni…");
      setImportProgress({ done: 0, total: importRows.length });

      // mappa conflitti per CF (solo CF valorizzati)
      const conflictByCf = new Map();
      for (const c of conflicts) {
        const exCf = cfKey(c?.existing?.cod_fiscale);
        if (exCf) conflictByCf.set(exCf, c);
      }

      const actions = [];
      for (const r of importRows) {
        const k = cfKey(r.cod_fiscale);
        if (!k) {
          // niente CF -> sempre insert (non può confliggere per CF)
          actions.push({ action: "insert", incoming: r });
          continue;
        }

        const c = conflictByCf.get(k);
        if (!c) {
          actions.push({ action: "insert", incoming: r });
          continue;
        }

        const exId = c?.existing?.id;
        const choice = conflictChoice[exId] || "overwrite";

        if (choice === "skip") {
          actions.push({ action: "skip", incoming: r });
        } else if (choice === "overwrite") {
          actions.push({ action: "overwrite", incoming: r, targetId: exId });
        } else if (choice === "insert") {
          const newCf = normalizeCF(conflictNewCF[exId]);
          actions.push({
            action: "insert",
            incoming: { ...r, cod_fiscale: newCf || null },
          });
        } else {
          actions.push({ action: "overwrite", incoming: r, targetId: exId });
        }
      }

      // commit a blocchi
      const CHUNK = 200;
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let errors = [];

      setImportProgress({ done: 0, total: actions.length });

      for (let i = 0; i < actions.length; i += CHUNK) {
        const slice = actions.slice(i, i + CHUNK);
        setImportStage(`Import in corso… (${Math.min(i + CHUNK, actions.length)}/${actions.length})`);

        const r = await api.commitImportTesserati(token, slice);

        inserted += r?.inserted ?? 0;
        updated += r?.updated ?? 0;
        skipped += r?.skipped ?? 0;
        if (Array.isArray(r?.errors) && r.errors.length) errors = errors.concat(r.errors);

        setImportProgress({ done: Math.min(i + CHUNK, actions.length), total: actions.length });
      }

      // ricarico lista
      setImportStage("Ricarico elenco…");
      const list = await api.getTesserati(token);
      setItems(Array.isArray(list) ? list : []);

      setImportOpen(false);
      resetImportState();

      if (errors.length > 0) {
        showToast(
          "warn",
          `Import completato con errori. Inseriti ${inserted}, aggiornati ${updated}, saltati ${skipped}, errori ${errors.length}.`
        );
        console.warn("Import errors:", errors);
      } else {
        showToast("ok", `Import completato. Inseriti ${inserted}, aggiornati ${updated}, saltati ${skipped}.`);
      }
    } catch (e) {
      console.error(e);
      showToast("error", e.message || "Errore import.");
    } finally {
      setImportBusy(false);
      setImportStage("");
      setImportProgress({ done: 0, total: 0 });
    }
  }

  // ---------------- UI ----------------
  return (
    <div className="tess-page">
      {/* Toast */}
      {toast?.msg ? <div className={`toast toast-${toast.type}`}>{toast.msg}</div> : null}

      <div className="tess-header">
        <div>
          <h2 className="tess-title">Tesserati</h2>
          <div className="tess-sub">
            Gestisci tesserati e insegnanti. Import rapido da Excel. (Ruolo: {isAdmin ? "Admin" : "Utente"})
          </div>
        </div>


        <div className="tess-actions">
          {isAdmin && (
            <>
              <button className="btnPrimary" type="button" onClick={openNew}>
                + Nuovo
              </button>

              <button className="btnGhost" type="button" onClick={pickExcel}>
                Importa Excel
              </button>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // permette di selezionare lo stesso file due volte
              handleFile(f);
            }}
          />

        </div>
      </div>

      <div className="tess-toolbar">
        <div className="tess-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca: nome, cognome, CF, telefono, email…" />
        </div>

        <div className="tess-filters">
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
            {tipoOptions.map((o) => (
              <option key={o} value={o}>
                Tipo: {o}
              </option>
            ))}
          </select>

          <select value={filterAnno} onChange={(e) => setFilterAnno(e.target.value)}>
            {annoOptions.map((o) => (
              <option key={o} value={o}>
                Anno: {o}
              </option>
            ))}
          </select>

          <select value={filterPay} onChange={(e) => setFilterPay(e.target.value)}>
            {payOptions.map((o) => (
              <option key={o} value={o}>
                Pagamento: {o}
              </option>
            ))}
          </select>

          <button
            className="btnGhost"
            onClick={() => {
              setQ("");
              setFilterTipo("Tutti");
              setFilterAnno("Tutti");
              setFilterPay("Tutti");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="tess-card">
        <div className="tess-cardTop">
          <div className="tess-badge">
            Totale: <b>{items.length}</b> — Filtrati: <b>{filtered.length}</b>
          </div>
          <div className="tess-rightNote">{loading ? "Caricamento…" : "Pronto"}</div>
        </div>

        <div className="tess-tableWrap">
          <table className="tess-table">
            <thead>
              <tr>
                <th>Nome e Cognome</th>
                <th>Cod. fiscale</th>
                <th>Cellulare</th>
                <th>Email</th>
                <th>Tipo</th>
                <th>Anno</th>
                <th>Pagamento</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="emptyRow">
                    Nessun tesserato trovato.
                  </td>
                </tr>
              ) : (
                filtered.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <div className="nameCell">
                        <div className="nameMain">
                          {x.cognome} {x.nome}
                        </div>
                        <div className="nameSub">{[x.citta, x.indirizzo].filter(Boolean).join(" • ")}</div>
                      </div>
                    </td>
                    <td className="mono">{x.cod_fiscale || "—"}</td>
                    <td className="mono">{x.cellulare || "—"}</td>
                    <td className="mono">{x.email || "—"}</td>
                    <td>
                      <span className="pill">{x.tipo || "—"}</span>
                    </td>
                    <td>
                      <span className="pill pill-soft">{x.anno || "—"}</span>
                    </td>
                    <td>
                      <span className={`pill ${x.pagamento ? "pill-ok" : "pill-warn"}`}>{x.pagamento || "Da inserire"}</span>
                    </td>
                    <td className="actionsCell">
                      <button className="btnSmall" onClick={() => openProfile(x)}>
                        Profilo
                      </button>
                      <button className="btnSmall" onClick={() => openEdit(x)}>
                        Modifica
                      </button>
                      <button className="btnSmall btnDanger" onClick={() => deleteTesserato(x.id)}>
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- Modale Create/Edit ---------------- */}
      {modalOpen && (
        <div className="modalBack" onMouseDown={() => setModalOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">{editing?.__isNew ? "Nuovo tesserato" : "Modifica tesserato"}</div>
                <div className="modalSubtitle">Compila i dati principali. CF ed email non sono obbligatori.</div>
              </div>
              <button className="iconBtn" onClick={() => setModalOpen(false)} aria-label="Chiudi">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="formGrid">
                <label>
                  Nome
                  <input value={editing?.nome || ""} onChange={(e) => setEditing((p) => ({ ...p, nome: e.target.value }))} />
                </label>
                <label>
                  Cognome
                  <input value={editing?.cognome || ""} onChange={(e) => setEditing((p) => ({ ...p, cognome: e.target.value }))} />
                </label>
                <label>
                  Codice fiscale (facoltativo)
                  <input value={editing?.cod_fiscale || ""} onChange={(e) => setEditing((p) => ({ ...p, cod_fiscale: e.target.value }))} />
                </label>
                <label>
                  Cellulare
                  <input value={editing?.cellulare || ""} onChange={(e) => setEditing((p) => ({ ...p, cellulare: e.target.value }))} />
                </label>
                <label>
                  Email
                  <input value={editing?.email || ""} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} />
                </label>
                <label>
                  Città
                  <input value={editing?.citta || ""} onChange={(e) => setEditing((p) => ({ ...p, citta: e.target.value }))} />
                </label>
                <label className="full">
                  Indirizzo
                  <input value={editing?.indirizzo || ""} onChange={(e) => setEditing((p) => ({ ...p, indirizzo: e.target.value }))} />
                </label>
                <label>
                  Tipo
                  <select value={editing?.tipo || "Tesserato"} onChange={(e) => setEditing((p) => ({ ...p, tipo: e.target.value }))}>
                    <option value="Tesserato">Tesserato</option>
                    <option value="Insegnante">Insegnante</option>
                    <option value="Staff">Staff</option>
                  </select>
                </label>
                <label>
                  Anno
                  <input value={editing?.anno || ""} onChange={(e) => setEditing((p) => ({ ...p, anno: e.target.value }))} placeholder="25/26" />
                </label>
                <label>
                  Pagamento
                  <input value={editing?.pagamento || ""} onChange={(e) => setEditing((p) => ({ ...p, pagamento: e.target.value }))} placeholder="Pagato / Non pagato / ..." />
                </label>
                <label className="full">
                  Note
                  <textarea value={editing?.note || ""} onChange={(e) => setEditing((p) => ({ ...p, note: e.target.value }))} rows={3} />
                </label>
              </div>
            </div>

            <div className="modalFoot">
              <button className="btnGhost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button className="btnPrimary" onClick={saveEditing}>
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modale Profilo ---------------- */}
      {profileOpen && (
        <div className="modalBack" onMouseDown={() => setProfileOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">Profilo</div>
                <div className="modalSubtitle">{profileItem?.cognome} {profileItem?.nome}</div>
              </div>
              <button className="iconBtn" onClick={() => setProfileOpen(false)} aria-label="Chiudi">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <div className="profileGrid">
                <div className="profileCard">
                  <div className="profileLabel">Codice fiscale</div>
                  <div className="profileValue mono">{profileItem?.cod_fiscale || "—"}</div>
                </div>
                <div className="profileCard">
                  <div className="profileLabel">Cellulare</div>
                  <div className="profileValue mono">{profileItem?.cellulare || "—"}</div>
                </div>
                <div className="profileCard">
                  <div className="profileLabel">Email</div>
                  <div className="profileValue mono">{profileItem?.email || "—"}</div>
                </div>
                <div className="profileCard">
                  <div className="profileLabel">Tipo</div>
                  <div className="profileValue">{profileItem?.tipo || "—"}</div>
                </div>
                <div className="profileCard">
                  <div className="profileLabel">Anno</div>
                  <div className="profileValue">{profileItem?.anno || "—"}</div>
                </div>
                <div className="profileCard">
                  <div className="profileLabel">Pagamento</div>
                  <div className="profileValue">{profileItem?.pagamento || "—"}</div>
                </div>
                <div className="profileCard full">
                  <div className="profileLabel">Indirizzo</div>
                  <div className="profileValue">{[profileItem?.citta, profileItem?.indirizzo].filter(Boolean).join(" — ") || "—"}</div>
                </div>
                <div className="profileCard full">
                  <div className="profileLabel">Note</div>
                  <div className="profileValue">{profileItem?.note || "—"}</div>
                </div>
              </div>
            </div>

            <div className="modalFoot">
              <button className="btnPrimary" onClick={() => setProfileOpen(false)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modale Import Excel ---------------- */}
      {importOpen && (
        <div className="modalBack" onMouseDown={() => (!importBusy ? setImportOpen(false) : null)}>
          <div className="modal modalWide modalImportExcel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">Import Excel</div>
                <div className="modalSubtitle">
                  Importa tutte le righe (si scartano solo quelle completamente vuote). Gestisci i duplicati per CF.
                </div>
              </div>
              <button className="iconBtn" onClick={() => (!importBusy ? setImportOpen(false) : null)} aria-label="Chiudi" disabled={importBusy}>
                ✕
              </button>
            </div>

            <div className="modalBody">
              {/* Barra stato */}
              <div className="importTopBar">
                <div className="importStats">
                  <div className="statPill">
                    Totale: <b>{importStats.total}</b>
                  </div>
                  <div className="statPill">
                    Valide: <b>{importStats.valid}</b>
                  </div>
                  <div className="statPill">
                    Vuote scartate: <b>{importStats.invalid}</b>
                  </div>
                  <div className="statPill">
                    Duplicati nel file (scartati): <b>{importStats.duplicatesInFile}</b>
                  </div>
                  <div className={`statPill ${importStats.conflicts ? "statPillWarn" : ""}`}>
                    CF già presenti: <b>{importStats.conflicts}</b>
                  </div>
                </div>

                <div className="importRight">
                  {(importLoading || importBusy) && (
                    <div className="importStage">
                      <div className="spinner" />
                      <div>
                        <div className="stageTitle">{importStage || "Operazione in corso…"}</div>
                        {importProgress.total > 0 && (
                          <div className="progressWrap">
                            <div className="progressBar">
                              <div
                                className="progressFill"
                                style={{
                                  width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="progressText">
                              {importProgress.done}/{importProgress.total}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Layout 2 colonne */}
              <div className="importLayout">
                {/* Anteprima */}
                <section className="importSection">
                  <div className="sectionHead">
                    <div className="sectionTitle">Anteprima import</div>
                    <div className="sectionHint">Mostro le prime 20 righe (solo preview).</div>
                  </div>

                  <div className="tableMiniWrap">
                    <table className="tableMini">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Cognome</th>
                          <th>CF</th>
                          <th>Cell</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 20).map((r) => (
                          <tr key={r._tmp_id}>
                            <td>{r.nome || "—"}</td>
                            <td>{r.cognome || "—"}</td>
                            <td className="mono">{r.cod_fiscale || "—"}</td>
                            <td className="mono">{r.cellulare || "—"}</td>
                          </tr>
                        ))}
                        {importRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="emptyRow">
                              Nessuna riga.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Duplicati */}
                <section className="importSection importSectionWarn">
                  <div className="sectionHead">
                    <div className="sectionTitle">Duplicati per CF (server)</div>
                    <div className="sectionHint">
                      Per ogni duplicato scegli: <b>Sovrascrivi</b>, <b>Crea nuovo</b> (con CF nuovo), oppure <b>Salta</b>.
                    </div>
                  </div>

                  <div className="conflictsScroll">
                    {conflicts.length === 0 ? (
                      <div className="emptyBox">Nessun duplicato trovato 🎉</div>
                    ) : (
                      conflicts.map((c, idx) => {
                        const ex = c.existing || {};
                        const inc = c.incoming || {};
                        const exId = ex.id || `noid_${idx}`;
                        const choice = conflictChoice[exId] || "overwrite";

                        return (
                          <div key={exId} className="conflictCard">
                            <div className="conflictCols">
                              <div className="conflictCol">
                                <div className="conflictTag">ESISTENTE</div>
                                <div className="conflictName">
                                  {ex.cognome} {ex.nome}
                                </div>
                                <div className="conflictMeta">
                                  <span className="mono">Cell: {ex.cellulare || "—"}</span>
                                  <span className="mono">CF: {ex.cod_fiscale || "—"}</span>
                                </div>
                              </div>

                              <div className="conflictDivider" />

                              <div className="conflictCol">
                                <div className="conflictTag conflictTagSoft">IMPORT</div>
                                <div className="conflictName">
                                  {inc.cognome} {inc.nome}
                                </div>
                                <div className="conflictMeta">
                                  <span className="mono">Cell: {inc.cellulare || "—"}</span>
                                  <span className="mono">CF: {inc.cod_fiscale || "—"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="choiceRow">
                              <div className="choiceLabel">Azione</div>

                              <label className="radioPill">
                                <input
                                  type="radio"
                                  name={`c_${exId}`}
                                  checked={choice === "overwrite"}
                                  onChange={() => setChoice(exId, "overwrite")}
                                />
                                Sovrascrivi
                              </label>

                              <label className="radioPill">
                                <input
                                  type="radio"
                                  name={`c_${exId}`}
                                  checked={choice === "insert"}
                                  onChange={() => setChoice(exId, "insert")}
                                />
                                Crea nuovo
                              </label>

                              <label className="radioPill">
                                <input
                                  type="radio"
                                  name={`c_${exId}`}
                                  checked={choice === "skip"}
                                  onChange={() => setChoice(exId, "skip")}
                                />
                                Salta
                              </label>

                              {choice === "insert" && (
                                <div className="newCfBox">
                                  <span>Nuovo CF:</span>
                                  <input
                                    className="newCfInput"
                                    placeholder="Inserisci un CF diverso"
                                    value={conflictNewCF[exId] || ""}
                                    onChange={(e) => setNewCf(exId, e.target.value)}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="modalFoot">
              <button className="btnGhost" onClick={() => (!importBusy ? setImportOpen(false) : null)} disabled={importBusy}>
                Annulla
              </button>
              <button className="btnPrimary" onClick={confirmImport} disabled={importBusy || importLoading || !canConfirmImport()}>
                {importBusy ? "Import in corso…" : "Conferma import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}