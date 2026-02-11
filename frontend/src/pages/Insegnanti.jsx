import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/insegnanti.css";

const DOC_TYPES = {
  CONTRACT: "contract",
  PAYSLIP: "payslip",
};

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function formatMonthLabel(yyyyMm) {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm || "";
  const [y, m] = yyyyMm.split("-");
  return `${m}/${y}`;
}

export default function Insegnanti({ token, user }) {
  const isAdmin = user?.role === "admin";

  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openTeacher, setOpenTeacher] = useState(null);
  const [docs, setDocs] = useState([]);

  const [activeTab, setActiveTab] = useState("profilo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [editCourses, setEditCourses] = useState("");
  const monthInputRef = useRef(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCourses, setNewCourses] = useState("");

  // ✅ signed url foto profilo per sostituire avatar
  const [photoSignedUrl, setPhotoSignedUrl] = useState("");
  const [photoMap, setPhotoMap] = useState({});


  // Base API: usa env su Vercel oppure /api in locale (con proxy)
  const API_BASE = import.meta.env.VITE_API_URL || "/api";

  function authHeaders(extra = {}) {
    return {
      ...extra,
      Authorization: `Bearer ${token}`,
    };
  }

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
    return json;
  }

  async function apiPost(path, body, isFormData = false) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: isFormData
        ? authHeaders()
        : authHeaders({ "Content-Type": "application/json" }),
      body: isFormData ? body : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
    return json;
  }

  async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Errore ${res.status}`);
    return json;
  }

  useEffect(() => {
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTeachers() {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet("/teachers");
      const list = data?.teachers || [];
      setTeachers(list);

      // ✅ crea signed-url per le foto (bucket private) così le mostri nelle card
      try {
        const paths = list.map(t => t.photo_path).filter(Boolean);

        if (paths.length === 0) {
          setPhotoMap({});
        } else {
          const r = await apiPost("/teachers/signed-urls", { paths });
          const urlsByPath = r?.urls || {};

          const map = {};
          for (const t of list) {
            if (t.photo_path && urlsByPath[t.photo_path]) {
              map[t.id] = urlsByPath[t.photo_path];
            }
          }
          setPhotoMap(map);
        }
      } catch {
        setPhotoMap({});
      }
    } catch (e) {
      setError(e.message || "Errore caricamento insegnanti");
    } finally {
      setLoading(false);
    }
  }


  async function loadDocs(teacherId) {
    setError("");
    try {
      const data = await apiGet(`/teachers/${teacherId}/documents`);
      setDocs(data?.documents || []);
    } catch (e) {
      setDocs([]);
      setError(e.message || "Errore caricamento documenti");
    }
  }

  async function refreshPhotoSignedUrl(photoPath) {
    setPhotoSignedUrl("");
    if (!photoPath) return;

    try {
      const data = await apiPost("/storage/signed-url", { path: photoPath });
      setPhotoSignedUrl(data?.signedUrl || "");
    } catch {
      setPhotoSignedUrl("");
    }
  }

  async function openProfile(teacher) {
    setOpenTeacher(teacher);
    setActiveTab("profilo");
    setEditCourses(safeArray(teacher.courses).join(", "));
    setError("");

    await loadDocs(teacher.id);
    await refreshPhotoSignedUrl(teacher.photo_path);
  }

  function closeModal() {
    setOpenTeacher(null);
    setDocs([]);
    setActiveTab("profilo");
    setError("");
    setBusy(false);
    setPhotoSignedUrl("");
  }

  const contractDoc = useMemo(
    () => docs.find((d) => d.type === DOC_TYPES.CONTRACT) || null,
    [docs]
  );

  const payslips = useMemo(
    () =>
      docs
        .filter((d) => d.type === DOC_TYPES.PAYSLIP)
        .sort((a, b) => (b.month || "").localeCompare(a.month || "")),
    [docs]
  );

  async function openFile(filePath) {
    setError("");
    try {
      const data = await apiPost("/storage/signed-url", { path: filePath });
      if (!data?.signedUrl) throw new Error("Signed URL non ricevuto");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message || "Errore apertura file");
    }
  }

  async function handleSaveCourses() {
    if (!isAdmin) return;
    if (!openTeacher?.id) return;

    setBusy(true);
    setError("");

    try {
      const courses = editCourses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await apiPost(`/teachers/${openTeacher.id}/update`, { courses });

      // aggiorna UI
      setOpenTeacher((prev) => (prev ? { ...prev, courses } : prev));
      await loadTeachers();
    } catch (e) {
      setError(e.message || "Errore salvataggio corsi");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadPhoto(file) {
    if (!isAdmin) return;
    if (!openTeacher?.id || !file) return;

    setBusy(true);
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      // ✅ il backend dovrebbe ritornare { photo_path: "..." } (meglio)
      const resp = await apiPost(`/teachers/${openTeacher.id}/photo`, fd, true);

      const newPhotoPath = resp?.photo_path;

      // aggiorna openTeacher + signed url subito
      if (newPhotoPath) {
        setOpenTeacher((prev) => (prev ? { ...prev, photo_path: newPhotoPath } : prev));
        await refreshPhotoSignedUrl(newPhotoPath);
      } else {
        // fallback: ricarico lista e provo a leggere path aggiornato
        await loadTeachers();
        const tFresh = (teachers || []).find((x) => x.id === openTeacher.id);
        if (tFresh?.photo_path) {
          setOpenTeacher((prev) => (prev ? { ...prev, photo_path: tFresh.photo_path } : prev));
          await refreshPhotoSignedUrl(tFresh.photo_path);
        }
      }

      await loadTeachers();
    } catch (e) {
      setError(e.message || "Errore upload foto");
    } finally {
      setBusy(false);
    }
  }

  // ✅ ELIMINA FOTO (serve backend DELETE /api/teachers/:id/photo)
  async function handleDeletePhoto() {
    if (!isAdmin) return;
    if (!openTeacher?.id) return;

    const ok = window.confirm("Vuoi eliminare la foto profilo?");
    if (!ok) return;

    setBusy(true);
    setError("");

    try {
      await apiDelete(`/teachers/${openTeacher.id}/photo`);

      setPhotoSignedUrl("");
      setOpenTeacher((prev) => (prev ? { ...prev, photo_path: null } : prev));

      await loadTeachers();
    } catch (e) {
      setError(e.message || "Errore eliminazione foto");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadContract(file) {
    if (!isAdmin) return;
    if (!openTeacher?.id || !file) return;

    setBusy(true);
    setError("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      await apiPost(`/teachers/${openTeacher.id}/contract`, fd, true);
      await loadDocs(openTeacher.id);
    } catch (e) {
      setError(e.message || "Errore upload contratto");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadPayslip({ file, month }) {
    if (!isAdmin) return;
    if (!openTeacher?.id || !file) return;

    setBusy(true);
    setError("");

    try {
      if (!/^\d{4}-\d{2}$/.test(month || "")) {
        throw new Error("Seleziona un mese valido (YYYY-MM).");
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("month", month);

      await apiPost(`/teachers/${openTeacher.id}/payslip`, fd, true);
      await loadDocs(openTeacher.id);
    } catch (e) {
      setError(e.message || "Errore upload distinta");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDoc(docRow) {
    if (!isAdmin) return;
    if (!docRow?.id || !openTeacher?.id) return;

    setBusy(true);
    setError("");

    try {
      await apiDelete(`/teachers/${openTeacher.id}/documents/${docRow.id}`);
      await loadDocs(openTeacher.id);
    } catch (e) {
      setError(e.message || "Errore eliminazione documento");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTeacher() {
    if (!isAdmin) return;

    setBusy(true);
    setError("");

    try {
      const full_name = newName.trim();
      if (!full_name) throw new Error("Inserisci il nome insegnante.");

      const courses = newCourses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await apiPost("/teachers", { full_name, courses });

      setShowCreate(false);
      setNewName("");
      setNewCourses("");
      await loadTeachers();
    } catch (e) {
      setError(e.message || "Errore creazione insegnante");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="insegnanti-page">
      <div className="insegnanti-header">
        <div>
          <h1>Insegnanti</h1>
          <p className="muted">
            Profili insegnanti: foto, contratto firmato, distinte mensili e corsi svolti.
          </p>
        </div>

        <div className="header-actions">
          {isAdmin && (
            <button
              className="btn primary"
              onClick={() => setShowCreate(true)}
              disabled={busy}
            >
              + Aggiungi insegnante
            </button>
          )}
          <button className="btn" onClick={loadTeachers} disabled={loading}>
            Aggiorna
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {loading ? (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="teachers-grid">
          {teachers.map((t) => (
            <div
              key={t.id}
              className="teacher-card"
              onClick={() => openProfile(t)}
              role="button"
            >
              <div className="teacher-top">
                <div className="avatar">
                  {photoMap[t.id] ? (
                    <img src={photoMap[t.id]} alt={`Foto ${t.full_name}`} />
                  ) : (
                    <span>👤</span>
                  )}
                </div>

                <div className="teacher-main">
                  <div className="teacher-name">{t.full_name}</div>
                  <div className="teacher-sub muted">
                    {safeArray(t.courses).length
                      ? safeArray(t.courses).join(" • ")
                      : "Corsi non impostati"}
                  </div>
                </div>
              </div>

              <div className="teacher-cta">
                <span className="link">Apri profilo →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && teachers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">Nessun insegnante presente</div>
          <div className="muted">
            Clicca “Aggiungi insegnante” per inserirne uno.
          </div>
        </div>
      ) : null}

      {/* MODAL CREAZIONE */}
      {showCreate ? (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <div>
                  <div className="teacher-name big">Aggiungi insegnante</div>
                  <div className="muted">Inserisci nome e corsi (facoltativo)</div>
                </div>
              </div>
              <button className="btn ghost" onClick={() => setShowCreate(false)}>
                Chiudi ✕
              </button>
            </div>

            <div className="modal-body">
              {error ? <div className="alert">{error}</div> : null}

              <div className="section">
                <h3>Dati</h3>
                <div className="row gap wrap">
                  <input
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome e cognome"
                    disabled={busy}
                  />
                  <input
                    className="input"
                    value={newCourses}
                    onChange={(e) => setNewCourses(e.target.value)}
                    placeholder="Corsi (es: Bachata, Salsa)"
                    disabled={busy}
                  />
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <button className="btn primary" onClick={handleCreateTeacher} disabled={busy}>
                    Salva
                  </button>
                  <button className="btn" onClick={() => setShowCreate(false)} disabled={busy}>
                    Annulla
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL PROFILO */}
      {openTeacher ? (
        <div className="modal-backdrop" onMouseDown={closeModal}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {/* ✅ avatar sostituito dalla foto */}
                <div className="avatar lg">
                  {photoSignedUrl ? (
                    <img src={photoSignedUrl} alt="Foto profilo" />
                  ) : (
                    <span>👤</span>
                  )}
                </div>

                <div>
                  <div className="teacher-name big">{openTeacher.full_name}</div>
                  <div className="muted">
                    {safeArray(openTeacher.courses).length
                      ? safeArray(openTeacher.courses).join(" • ")
                      : "Corsi non impostati"}
                  </div>
                </div>
              </div>

              <button className="btn ghost" onClick={closeModal}>
                Chiudi ✕
              </button>
            </div>

            <div className="tabs">
              <button
                className={`tab ${activeTab === "profilo" ? "active" : ""}`}
                onClick={() => setActiveTab("profilo")}
              >
                Profilo
              </button>
              <button
                className={`tab ${activeTab === "contratto" ? "active" : ""}`}
                onClick={() => setActiveTab("contratto")}
              >
                Contratto
              </button>
              <button
                className={`tab ${activeTab === "distinte" ? "active" : ""}`}
                onClick={() => setActiveTab("distinte")}
              >
                Distinte
              </button>
            </div>

            {error ? <div className="alert">{error}</div> : null}

            {activeTab === "profilo" ? (
              <div className="modal-body">
                <div className="section">
                  <h3>Foto profilo</h3>
                  <p className="muted">Bucket private: la foto verrà servita via signed URL dal backend.</p>

                  <div className="photo-box">
                    <div className="avatar xl">
                      {photoSignedUrl ? (
                        <img src={photoSignedUrl} alt="Foto profilo" />
                      ) : (
                        <span>👤</span>
                      )}
                    </div>

                    <div className="photo-actions">
                      <label className={`file-btn ${!isAdmin ? "disabled" : ""}`}>
                        Carica foto
                        <input
                          type="file"
                          accept="image/*"
                          disabled={!isAdmin || busy}
                          onChange={(e) => handleUploadPhoto(e.target.files?.[0])}
                        />
                      </label>

                      {/* ✅ elimina foto */}
                      {isAdmin && openTeacher?.photo_path ? (
                        <button className="btn danger" onClick={handleDeletePhoto} disabled={busy}>
                          Elimina
                        </button>
                      ) : null}

                      {!isAdmin ? <div className="muted small">Solo admin può modificare.</div> : null}
                    </div>
                  </div>
                </div>

                <div className="section">
                  <h3>Corsi svolti</h3>
                  <p className="muted">Inserisci i corsi separati da virgola.</p>

                  <div className="row gap">
                    <input
                      className="input"
                      value={editCourses}
                      onChange={(e) => setEditCourses(e.target.value)}
                      placeholder="Bachata, Salsa, ..."
                      disabled={!isAdmin || busy}
                    />
                    <button className="btn" onClick={handleSaveCourses} disabled={!isAdmin || busy}>
                      Salva
                    </button>
                  </div>

                  <div className="chips">
                    {safeArray(openTeacher.courses).map((c) => (
                      <span key={c} className="chip">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "contratto" ? (
              <div className="modal-body">
                <div className="section">
                  <h3>Contratto firmato</h3>
                  <p className="muted">Si apre con link temporaneo (signed URL) dal backend.</p>

                  <div className="row gap wrap">
                    <label className={`file-btn ${!isAdmin ? "disabled" : ""}`}>
                      Carica contratto (PDF)
                      <input
                        type="file"
                        accept="application/pdf"
                        disabled={!isAdmin || busy}
                        onChange={(e) => handleUploadContract(e.target.files?.[0])}
                      />
                    </label>

                    {contractDoc ? (
                      <>
                        <button className="btn ghost" onClick={() => openFile(contractDoc.file_path)}>
                          Apri PDF
                        </button>
                        {isAdmin ? (
                          <button className="btn danger" onClick={() => handleDeleteDoc(contractDoc)} disabled={busy}>
                            Elimina
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">Nessun contratto caricato.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "distinte" ? (
              <div className="modal-body">
                <div className="section">
                  <h3>Distinte mensili</h3>

                  <div className="row gap wrap">
                    <input
                      ref={monthInputRef}
                      className="input"
                      type="month"
                      disabled={!isAdmin || busy}
                      defaultValue={new Date().toISOString().slice(0, 7)}
                    />

                    <label className={`file-btn ${!isAdmin ? "disabled" : ""}`}>
                      Carica distinta (PDF)
                      <input
                        type="file"
                        accept="application/pdf"
                        disabled={!isAdmin || busy}
                        onChange={(e) => {
                          const month = monthInputRef.current?.value;
                          const file = e.target.files?.[0];
                          handleUploadPayslip({ file, month });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  {!isAdmin ? <div className="muted small">Solo admin può caricare/eliminare.</div> : null}
                </div>

                <div className="section">
                  <h3>Storico distinte</h3>

                  {payslips.length === 0 ? (
                    <div className="muted">Nessuna distinta caricata.</div>
                  ) : (
                    <div className="docs-list">
                      {payslips.map((d) => (
                        <div key={d.id} className="doc-row">
                          <div className="doc-left">
                            <div className="doc-title">
                              {formatMonthLabel(d.month)} — {d.file_name}
                            </div>
                          </div>

                          <div className="doc-actions">
                            <button className="btn ghost" onClick={() => openFile(d.file_path)}>
                              Apri
                            </button>

                            {isAdmin ? (
                              <button className="btn danger" onClick={() => handleDeleteDoc(d)} disabled={busy}>
                                Elimina
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {busy ? <div className="modal-footer muted">Operazione in corso…</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}