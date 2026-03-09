import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function safeArray(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") return Object.values(x);
  return [];
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clampYear(y) {
  const n = parseInt(String(y || ""), 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2200) return new Date().getFullYear();
  return n;
}

function buildDefaultSeller() {
  return { name: "", address: "", city: "", vat: "", cf: "", iban: "", logo: "" };
}

function buildDefaultCustomer() {
  return { name: "", address: "", city: "", vat: "", cf: "", sdi: "", pec: "", email: "" };
}

function computeInvoiceTotals(items) {
  const rows = Array.isArray(items) ? items : [];
  let subtotal = 0;
  let vat = 0;
  let total = 0;

  for (const it of rows) {
    const qty = Math.max(0, toNum(it.qty ?? 1));
    const unit = toNum(it.unit_price ?? 0);
    const vatRate = Math.max(0, toNum(it.vat_rate ?? 0));
    const vatMode = String(it.vat_mode || "excluded");
    let lineSubtotal = 0;
    let lineVat = 0;
    let lineTotal = 0;

    if (vatMode === "included") {
      lineTotal = qty * unit;
      lineSubtotal = vatRate > 0 ? lineTotal / (1 + vatRate / 100) : lineTotal;
      lineVat = lineTotal - lineSubtotal;
    } else {
      lineSubtotal = qty * unit;
      lineVat = lineSubtotal * (vatRate / 100);
      lineTotal = lineSubtotal + lineVat;
    }

    subtotal += lineSubtotal;
    vat += lineVat;
    total += lineTotal;
  }

  subtotal = Number(subtotal.toFixed(2));
  vat = Number(vat.toFixed(2));
  total = Number(total.toFixed(2));
  return { subtotal, vat, total };
}

/* ===============================
   Cedente / prestatore (localStorage)
   =============================== */
const SELLER_LS_KEY = "gest:invoices:seller_v1";

function loadSellerFromLS() {
  try {
    const raw = localStorage.getItem(SELLER_LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return { ...buildDefaultSeller(), ...obj };
  } catch {
    return null;
  }
}

function saveSellerToLS(seller) {
  try {
    localStorage.setItem(SELLER_LS_KEY, JSON.stringify(seller || {}));
  } catch {
    // ignore
  }
}

/* ===============================
   Clienti fatture (localStorage)
   =============================== */
const INVOICE_CUSTOMERS_KEY = "gest:invoiceCustomers";

function readInvoiceCustomers() {
  try {
    const raw = localStorage.getItem(INVOICE_CUSTOMERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeInvoiceCustomers(list) {
  try {
    localStorage.setItem(INVOICE_CUSTOMERS_KEY, JSON.stringify(list || []));
  } catch {
    // ignore
  }
}

function normalizeVat(v) {
  return String(v || "").trim().replace(/\s+/g, "").toUpperCase();
}
function normalizeName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

// Chiave cliente: P.IVA > CF > Ragione sociale
function customerKey(c) {
  const vat = normalizeVat(c?.vat);
  const cf = normalizeVat(c?.cf);
  const name = normalizeName(c?.name);
  return vat || cf || name || "";
}

function upsertCustomer(list, customer) {
  const c = customer || {};
  const key = customerKey(c);
  if (!key) return Array.isArray(list) ? list : [];

  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((x) => customerKey(x) === key);

  const id = idx >= 0 ? next[idx].id : (globalThis.crypto?.randomUUID?.() || String(Date.now()));

  const payload = {
    id,
    name: normalizeName(c.name),
    address: String(c.address || "").trim(),
    city: String(c.city || "").trim(),
    vat: String(c.vat || "").trim(),
    cf: String(c.cf || "").trim(),
    sdi: String(c.sdi || "").trim(),
    pec: String(c.pec || "").trim(),
    email: String(c.email || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) next[idx] = { ...next[idx], ...payload };
  else next.unshift(payload);

  return next.slice(0, 200);
}

function removeCustomerById(list, id) {
  return (Array.isArray(list) ? list : []).filter((c) => c.id !== id);
}

function findCustomerIdByObject(customers, obj) {
  const key = customerKey(obj);
  if (!key) return "";
  const hit = (customers || []).find((c) => customerKey(c) === key);
  return hit?.id || "";
}

/* =============================== */

export default function Bilancio({ token }) {
  const [tab, setTab] = useState("rendiconto");

  // RENDICONTO
  const [summary, setSummary] = useState({
    rows: [],
    totalEntrate: 0,
    totalUscite: 0,
    saldo: 0,
    totalEntrateIstituzionali: 0,
    totalEntrateCommerciali: 0,
    totalVat: 0,
  });

  // REPORT IVA
  const [iva, setIva] = useState({
    summary: {
      entrateIstituzionali: 0,
      entrateCommerciali: 0,
      imponibileCommerciale: 0,
      ivaCommerciale: 0,
      totaleCommerciale: 0,
    },
    byRate: [],
    rows: [],
  });

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // FATTURE
  const [invYear, setInvYear] = useState(String(new Date().getFullYear()));
  const [invSearch, setInvSearch] = useState("");
  const [invRows, setInvRows] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState("");

  const [invModalOpen, setInvModalOpen] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const [invDeleteId, setInvDeleteId] = useState(null);

  const [invEditId, setInvEditId] = useState(null);

  // Cedente HOME
  const [sellerDraft, setSellerDraft] = useState(() => loadSellerFromLS() || buildDefaultSeller());

  // Clienti HOME
  const [invCustomers, setInvCustomers] = useState(() => readInvoiceCustomers());
  const [custDraft, setCustDraft] = useState(() => ({ ...buildDefaultCustomer() }));
  const [custEditId, setCustEditId] = useState(null);
  const [custQuery, setCustQuery] = useState("");
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Cliente MODALE (solo select)
  const [invCustomerPick, setInvCustomerPick] = useState("");
  const [invCustomerQuery, setInvCustomerQuery] = useState("");

  useEffect(() => {
    writeInvoiceCustomers(invCustomers);
  }, [invCustomers]);

  const filteredInvCustomers = useMemo(() => {
    const q = String(invCustomerQuery || "").toLowerCase().trim();
    if (!q) return invCustomers;
    return invCustomers.filter((c) => {
      const hay = [c.name, c.vat, c.cf, c.sdi, c.pec, c.email, c.city, c.address].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [invCustomers, invCustomerQuery]);

  const filteredCustomersList = useMemo(() => {
    const q = String(custQuery || "").toLowerCase().trim();
    if (!q) return invCustomers;
    return invCustomers.filter((c) => {
      const hay = [c.name, c.vat, c.cf, c.sdi, c.pec, c.email, c.city, c.address].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [invCustomers, custQuery]);

  const fmt = useMemo(() => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }), []);

  const [invoiceForm, setInvoiceForm] = useState({
    year: new Date().getFullYear(),
    number: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
    items: [{ description: "Affitto sala / affitto ore", qty: 1, unit_price: 0, vat_rate: 0, vat_mode: "excluded" }],
  });

  const invTotals = useMemo(() => computeInvoiceTotals(invoiceForm.items), [invoiceForm.items]);

  // ---------------------- LOADERS
  async function loadRendiconto() {
    try {
      setError("");
      setLoading(true);

      const data = await api.getReportSummary(token, { from: fromDate || undefined, to: toDate || undefined });
      const root = data?.data ?? data;

      let detailRows =
        root?.rows ?? root?.perAccount ?? root?.perAccountRows ?? root?.detailRows ?? root?.accounts ?? [];
      detailRows = safeArray(detailRows);

      setSummary({
        rows: detailRows,
        totalEntrate: Number(root?.totalEntrate || 0),
        totalUscite: Number(root?.totalUscite || 0),
        saldo: Number(root?.saldo || 0),
        totalEntrateIstituzionali: Number(root?.totalEntrateIstituzionali || 0),
        totalEntrateCommerciali: Number(root?.totalEntrateCommerciali || 0),
        totalVat: Number(root?.totalVat || 0),
      });
    } catch (err) {
      setError(err?.message || "Errore nel caricamento del rendiconto");
      setSummary((s) => ({ ...s, rows: [] }));
    } finally {
      setLoading(false);
    }
  }

  async function loadIva() {
    try {
      setError("");
      setLoading(true);

      let payload;
      if (api.getIvaCommercialista) {
        payload = await api.getIvaCommercialista(token, { from: fromDate || undefined, to: toDate || undefined });
      } else {
        const base = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
        const params = new URLSearchParams();
        if (fromDate) params.append("from", fromDate);
        if (toDate) params.append("to", toDate);
        const q = params.toString() ? `?${params.toString()}` : "";

        const res = await fetch(`${base}/reportIva/data${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error((await res.text()) || "Errore report IVA");
        payload = await res.json();
      }

      const root = payload?.data ?? payload;
      setIva({
        summary: {
          entrateIstituzionali: Number(root?.summary?.entrate_istituzionali ?? root?.summary?.entrateIstituzionali ?? 0),
          entrateCommerciali: Number(root?.summary?.entrate_commerciali ?? root?.summary?.entrateCommerciali ?? 0),
          imponibileCommerciale: Number(
            root?.summary?.imponibile_commerciale ?? root?.summary?.imponibileCommerciale ?? 0
          ),
          ivaCommerciale: Number(root?.summary?.iva_commerciale ?? root?.summary?.ivaCommerciale ?? 0),
          totaleCommerciale: Number(root?.summary?.totale_commerciale ?? root?.summary?.totaleCommerciale ?? 0),
        },
        byRate: safeArray(root?.byRate ?? root?.by_rate ?? []),
        rows: safeArray(root?.rows ?? []),
      });
    } catch (err) {
      setError(err?.message || "Errore nel caricamento del report IVA");
    } finally {
      setLoading(false);
    }
  }

  async function loadInvoices() {
    try {
      setInvError("");
      setInvLoading(true);

      const year = clampYear(invYear);
      const resp = await api.getInvoices(token, { year });
      const root = resp?.data ?? resp;
      const rows = safeArray(root?.data ?? root);
      setInvRows(rows);
    } catch (err) {
      setInvError(err?.message || "Errore nel caricamento fatture");
      setInvRows([]);
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (tab === "rendiconto") loadRendiconto();
    else if (tab === "iva") loadIva();
    else loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  function handleSubmit(e) {
    e.preventDefault();
    if (tab === "rendiconto") loadRendiconto();
    else if (tab === "iva") loadIva();
    else loadInvoices();
  }

  function handleReset() {
    setFromDate("");
    setToDate("");
    setTimeout(() => {
      if (tab === "rendiconto") loadRendiconto();
      else if (tab === "iva") loadIva();
      else loadInvoices();
    }, 0);
  }

  async function handleExport(format) {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("from", fromDate);
      if (toDate) params.append("to", toDate);
      const q = params.toString() ? `?${params.toString()}` : "";
      const base = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

      let url = "";
      if (tab === "rendiconto") url = `${base}/report/export/${format}${q}`;
      else url = format === "pdf" ? `${base}/reportIva/pdf${q}` : `${base}/reportIva/export/${format}${q}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return alert("Errore export: " + (await res.text()));

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download =
        tab === "rendiconto"
          ? format === "xlsx"
            ? "rendiconto_orchidea.xlsx"
            : "rendiconto_orchidea.pdf"
          : format === "xlsx"
          ? "report_iva_commercialista.xlsx"
          : "report_iva_commercialista.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("Errore export: " + (err?.message || ""));
    }
  }

  // ---------------------- HOME: Cedente
  function saveSellerHome() {
    saveSellerToLS(sellerDraft);
    alert("Cedente salvato ✅");
  }

  // ---------------------- HOME: Clienti
  function resetCustomerDraft() {
    setCustDraft({ ...buildDefaultCustomer() });
    setCustEditId(null);
  }

  function saveCustomerHome() {
    const key = customerKey(custDraft);
    if (!key) return alert("Inserisci almeno Ragione sociale o P.IVA/CF per salvare il cliente.");
    setInvCustomers((prev) => upsertCustomer(prev, custDraft));
    setCustModalOpen(false);
    resetCustomerDraft();
  }

  function editCustomerHome(c) {
    setCustEditId(c.id);
    setCustDraft({
      name: c.name || "",
      address: c.address || "",
      city: c.city || "",
      vat: c.vat || "",
      cf: c.cf || "",
      sdi: c.sdi || "",
      pec: c.pec || "",
      email: c.email || "",
    });
  }

  function deleteCustomerHome(id) {
    if (!confirm("Eliminare questo cliente salvato?")) return;
    setInvCustomers((prev) => removeCustomerById(prev, id));
    if (custEditId === id) resetCustomerDraft();
  }
  // ---------------------- HOME: Modale cliente
  function openNewCustomerModal() {
    resetCustomerDraft();
    setCustModalOpen(true);
  }

  function openEditCustomerModal(c) {
    editCustomerHome(c);
    setCustModalOpen(true);
  }


  // ---------------------- MODALE: nuove/modifica
  async function openNewInvoice() {
    try {
      const year = clampYear(invYear);
      const next = await api.getInvoiceNextNumber(token, { year });
      const data = next?.data?.data ?? next?.data ?? next;
      const nextNumber = data?.nextNumber ?? data?.data?.nextNumber;

      setInvoiceForm({
        year,
        number: nextNumber || "",
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: "",
        notes: "",
        items: [{ description: "Affitto sala / affitto ore", qty: 1, unit_price: 0, vat_rate: 0, vat_mode: "excluded" }],
      });

      setInvEditId(null);
      const defaultId =
        findCustomerIdByObject(invCustomers, { name: "Balla e Snella" }) || (invCustomers[0]?.id || "");
      setInvCustomerPick(defaultId);
      setInvCustomerQuery("");
      setInvModalOpen(true);
    } catch (err) {
      alert(err?.message || "Errore calcolo progressivo");
    }
  }

  function openEditInvoice(row) {
    const year = clampYear(row.year || invYear);
    setInvEditId(row.id);

    // match cliente con quelli salvati; se non esiste lo aggiungo (così la select lo vede)
    const cid = findCustomerIdByObject(invCustomers, row.customer) || "";
    if (!cid && row.customer) setInvCustomers((prev) => upsertCustomer(prev, row.customer));
    const cid2 = cid || findCustomerIdByObject(invCustomers, row.customer) || "";
    setInvCustomerPick(cid2);
    setInvCustomerQuery("");

    setInvoiceForm({
      year,
      number: row.number || "",
      issue_date: row.issue_date || new Date().toISOString().slice(0, 10),
      due_date: row.due_date || "",
      notes: row.notes || "",
      items:
        Array.isArray(row.items) && row.items.length
          ? row.items.map((it) => ({
              description: it.description ?? "",
              qty: it.qty ?? 1,
              unit_price: it.unit_price ?? 0,
              vat_rate: it.vat_rate ?? 0,
              vat_mode: it.vat_mode ?? "excluded",
            }))
          : [{ description: "Affitto sala / affitto ore", qty: 1, unit_price: 0, vat_rate: 0, vat_mode: "excluded" }],
    });

    setInvModalOpen(true);
  }

  function closeInvoiceModal() {
    setInvModalOpen(false);
    setInvSaving(false);
  }

  function updateItem(idx, patch) {
    setInvoiceForm((s) => {
      const items = [...(s.items || [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...s, items };
    });
  }

  function addItem() {
    setInvoiceForm((s) => ({
      ...s,
      items: [...(s.items || []), { description: "", qty: 1, unit_price: 0, vat_rate: 0, vat_mode: "excluded" }],
    }));
  }

  function removeItem(idx) {
    setInvoiceForm((s) => {
      const items = [...(s.items || [])];
      items.splice(idx, 1);
      return { ...s, items: items.length ? items : [{ description: "", qty: 1, unit_price: 0, vat_rate: 0, vat_mode: "excluded" }] };
    });
  }

  function getSelectedCustomerObject() {
    return invCustomers.find((x) => x.id === invCustomerPick) || null;
  }

  async function updateInvoiceRequest(id, payload) {
    // se esiste api.updateInvoice la uso, altrimenti fetch PATCH
    if (api.updateInvoice) return api.updateInvoice(token, id, payload);

    const base = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
    const res = await fetch(`${base}/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 404 || res.status === 405) {
        throw new Error("Manca la route backend PATCH /api/invoices/:id (te la preparo io).");
      }
      throw new Error(txt || "Errore modifica fattura");
    }
    return res.json();
  }

  async function saveInvoice() {
    try {
      setInvSaving(true);

      const seller = loadSellerFromLS() || buildDefaultSeller();
      const customer = getSelectedCustomerObject();

      if (!customer || !customerKey(customer)) {
        alert("Seleziona un cliente dalla lista (crealo prima nella sezione Clienti).");
        return;
      }

      const payload = {
        year: clampYear(invoiceForm.year),
        number: invoiceForm.number ? parseInt(String(invoiceForm.number), 10) : undefined,
        issue_date: invoiceForm.issue_date,
        due_date: invoiceForm.due_date || null,
        seller,
        customer,
        items: (invoiceForm.items || []).map((it) => ({
          description: it.description,
          qty: Number(it.qty || 0),
          unit_price: Number(it.unit_price || 0),
          vat_rate: Number(it.vat_rate || 0),
          vat_mode: it.vat_mode || "excluded",
        })),
        notes: invoiceForm.notes,
      };

      if (invEditId) await updateInvoiceRequest(invEditId, payload);
      else await api.createInvoice(token, payload);

      setInvModalOpen(false);
      setInvEditId(null);
      await loadInvoices();
    } catch (err) {
      alert(err?.message || "Errore salvataggio fattura");
    } finally {
      setInvSaving(false);
    }
  }

  async function downloadInvoicePdf(row) {
    try {
      const blob = await api.downloadInvoicePdf(token, row.id);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `Fattura_${row.year}_${String(row.number || "").padStart(4, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err?.message || "Errore download PDF");
    }
  }

  async function confirmDeleteInvoice() {
    if (!invDeleteId) return;
    try {
      await api.deleteInvoice(token, invDeleteId);
      setInvDeleteId(null);
      await loadInvoices();
    } catch (err) {
      alert(err?.message || "Errore eliminazione fattura");
    }
  }

  const invFiltered = useMemo(() => {
    const q = String(invSearch || "").trim().toLowerCase();
    if (!q) return invRows;
    return (invRows || []).filter((r) => {
      const numStr = `${r.year}/${String(r.number || "").padStart(4, "0")}`;
      const custName = r?.customer?.name || "";
      return (
        numStr.toLowerCase().includes(q) ||
        String(r.issue_date || "").includes(q) ||
        String(custName).toLowerCase().includes(q) ||
        String(r.total || "").includes(q)
      );
    });
  }, [invRows, invSearch]);

  const selectedCustomerPreview = useMemo(() => getSelectedCustomerObject(), [invCustomerPick, invCustomers]);

  const { rows, totalEntrate, totalUscite, saldo, totalEntrateIstituzionali, totalEntrateCommerciali, totalVat } = summary;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Contabilità</h2>
          <p>Rendiconto finanziario + Report IVA per commercialista + Fatture.</p>
        </div>

        <div className="page-actions">
          {tab !== "fatture" ? (
            <>
              <button className="btn" type="button" onClick={() => handleExport("xlsx")}>
                Esporta Excel
              </button>
              <button className="btn btn-primary" type="button" onClick={() => handleExport("pdf")}>
                Esporta PDF
              </button>
            </>
          ) : (
            <button className="btn btn-primary" type="button" onClick={openNewInvoice}>
              + Nuova fattura
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Sezione</div>
        <div className="toolbar toolbar-wrap">
          <div className="tabs">
            <button className={`tab-btn ${tab === "rendiconto" ? "active" : ""}`} type="button" onClick={() => setTab("rendiconto")}>
              Rendiconto
            </button>
            <button className={`tab-btn ${tab === "iva" ? "active" : ""}`} type="button" onClick={() => setTab("iva")}>
              Report IVA (commercialista)
            </button>
            <button className={`tab-btn ${tab === "fatture" ? "active" : ""}`} type="button" onClick={() => setTab("fatture")}>
              Fatture
            </button>
          </div>
        </div>
      </div>

      {/* Filtri */}
      {tab !== "fatture" ? (
        <div className="panel">
          <div className="panel-title">Filtri periodo</div>

          <form className="toolbar toolbar-wrap" onSubmit={handleSubmit}>
            <div className="toolbar-row">
              <div className="toolbar-group">
                <label>
                  Da data
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </label>
              </div>

              <div className="toolbar-group">
                <label>
                  A data
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </label>
              </div>

              <div className="toolbar-buttons">
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Caricamento…" : "Filtra"}
                </button>
                <button className="btn" type="button" onClick={handleReset} disabled={loading}>
                  Reset
                </button>
              </div>
            </div>
          </form>

          {error && <div className="error">{error}</div>}
        </div>
      ) : (
        <>
          {/* HOME: Cedente + Clienti sopra ai filtri Fatture */}
          <div className="panel">
            <button
              type="button"
              className="inv-settings-header"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
            >
              <div className="inv-settings-header__text">
                <div className="panel-title">Impostazioni fatture</div>
                <div className="muted small">Cedente e clienti</div>
              </div>
              <div className={"inv-settings-chevron " + (settingsOpen ? "open" : "")}>⌄</div>
            </button>

            {settingsOpen && (
              <div className="invoice-grid inv-settings-grid" style={{ marginTop: 10 }}>
<div className="invoice-card">
                <h4>Cedente / Prestatore (tu)</h4>
                <div className="invoice-form">
                  <div className="row">
                    <label className="full">
                      Ragione sociale
                      <input type="text" value={sellerDraft.name} onChange={(e) => setSellerDraft((s) => ({ ...s, name: e.target.value }))} />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Indirizzo
                      <input type="text" value={sellerDraft.address} onChange={(e) => setSellerDraft((s) => ({ ...s, address: e.target.value }))} />
                    </label>
                    <label>
                      Città
                      <input type="text" value={sellerDraft.city} onChange={(e) => setSellerDraft((s) => ({ ...s, city: e.target.value }))} />
                    </label>
                  </div>
                  <div className="row-3">
                    <label>
                      P.IVA
                      <input type="text" value={sellerDraft.vat} onChange={(e) => setSellerDraft((s) => ({ ...s, vat: e.target.value }))} />
                    </label>
                    <label>
                      CF
                      <input type="text" value={sellerDraft.cf} onChange={(e) => setSellerDraft((s) => ({ ...s, cf: e.target.value }))} />
                    </label>
                    <label>
                      IBAN
                      <input type="text" value={sellerDraft.iban} onChange={(e) => setSellerDraft((s) => ({ ...s, iban: e.target.value }))} />
                    </label>
                    <label>
                      Logo (path file o data URL)
                      <input type="text" value={sellerDraft.logo || ""} onChange={(e) => setSellerDraft((s) => ({ ...s, logo: e.target.value }))} placeholder="es. C:/loghi/logo.png oppure data:image/png;base64,..." />
                    </label>
                  </div>

                  <div className="modal-buttons" style={{ marginTop: 10, borderTop: "none", paddingTop: 0 }}>
                    <button className="btn btn-primary" type="button" onClick={saveSellerHome}>
                      Salva cedente
                    </button>
                  </div>
                </div>
              </div>

<div className="invoice-card">
                <h4>Clienti</h4>

                <div className="invoice-form">
                  <div className="inv-customer-home">
                    <label className="full">
                      Cerca cliente
                      <input
                        type="text"
                        value={custQuery}
                        onChange={(e) => setCustQuery(e.target.value)}
                        placeholder="Cerca per nome, P.IVA, CF, email…"
                      />
                    </label>

                    <div className="inv-customer-actions">
                      <button className="btn btn-primary" type="button" onClick={() => { /* filtro live */ }}>
                        Cerca
                      </button>
                      <button className="btn" type="button" onClick={openNewCustomerModal}>
                        Nuovo cliente
                      </button>
                    </div>
                  </div>

                  <div className="table-wrapper" style={{ marginTop: 10, maxHeight: 220, overflow: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th className="num">P.IVA / CF</th>
                          <th>Email</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomersList.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{c.name || "—"}</div>
                            </td>
                            <td className="num">{c.vat || c.cf || "—"}</td>
                            <td>{c.email || "—"}</td>
                            <td>
                              <div className="row-actions">
                                <button className="btn" type="button" onClick={() => openEditCustomerModal(c)}>
                                  Modifica
                                </button>
                                <button className="btn" type="button" onClick={() => deleteCustomerHome(c.id)}>
                                  Elimina
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}

                        {(!filteredCustomersList || filteredCustomersList.length === 0) && (
                          <tr>
                            <td colSpan={4} className="muted">
                              Nessun cliente trovato.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>

          {/* Filtri Fatture */}
          <div className="panel">
            <div className="panel-title">Fatture</div>

            <div className="invoice-topbar">
              <div className="filters">
                <label>
                  Anno
                  <input type="number" value={invYear} onChange={(e) => setInvYear(e.target.value)} onBlur={() => setInvYear(String(clampYear(invYear)))} />
                </label>

                <label>
                  Cerca
                  <input type="text" placeholder="es. 2026/0001, Balla e Snella, 2026-02-10" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
                </label>

                <div className="toolbar-buttons">
                  <button className="btn" type="button" onClick={loadInvoices} disabled={invLoading}>
                    {invLoading ? "Caricamento…" : "Aggiorna"}
                  </button>
                </div>
              </div>

              <div className="muted small">Numerazione automatica per anno (modificabile).</div>
            </div>

            {invError && <div className="error">{invError}</div>}
          </div>
        </>
      )}

      {/* RENDICONTO (invariato) */}
      {tab === "rendiconto" ? (
        <>
          <div className="panel">
            <div className="panel-title">Riepilogo</div>

            <div className="cards">
              <div className="card">
                <div className="label">Entrate totali</div>
                <div className="value green">{fmt.format(totalEntrate)}</div>
              </div>
              <div className="card">
                <div className="label">Uscite totali</div>
                <div className="value red">{fmt.format(totalUscite)}</div>
              </div>
              <div className="card">
                <div className="label">Saldo</div>
                <div className="value">{fmt.format(saldo)}</div>
              </div>
              <div className="card">
                <div className="label">Entrate istituzionali</div>
                <div className="value">{fmt.format(totalEntrateIstituzionali)}</div>
              </div>
              <div className="card">
                <div className="label">Entrate commerciali</div>
                <div className="value">{fmt.format(totalEntrateCommerciali)}</div>
              </div>
              <div className="card">
                <div className="label">IVA (solo Bar - C)</div>
                <div className="value">{fmt.format(totalVat)}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Dettaglio per conto</div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Codice</th>
                    <th>Descrizione conto</th>
                    <th>Tipo</th>
                    <th className="num">Entrate</th>
                    <th className="num">Uscite</th>
                    <th className="num">Saldo</th>
                    <th className="num">Entrate ist.</th>
                    <th className="num">Entrate comm.</th>
                    <th className="num">IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.account_code ?? r.code ?? r.accountCode ?? ""}</td>
                      <td>{r.account_name ?? r.name ?? r.accountName ?? ""}</td>
                      <td>{r.type ?? r.kind ?? ""}</td>
                      <td className="num">{fmt.format(Number(r.entrate || r.in || 0))}</td>
                      <td className="num">{fmt.format(Number(r.uscite || r.out || 0))}</td>
                      <td className="num">{fmt.format(Number(r.saldo || 0))}</td>
                      <td className="num">{fmt.format(Number(r.entrate_istituzionali ?? r.entrateIstituzionali ?? 0))}</td>
                      <td className="num">{fmt.format(Number(r.entrate_commerciali ?? r.entrateCommerciali ?? 0))}</td>
                      <td className="num">{fmt.format(Number(r.vat ?? r.iva ?? 0))}</td>
                    </tr>
                  ))}

                  {(!rows || rows.length === 0) && (
                    <tr>
                      <td colSpan={9} className="muted">
                        Nessun dato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* IVA (invariato a livello logico; UI dipende dal tuo file originale) */}
{/* IVA */}
{tab === "iva" ? (
  <>
    <div className="panel">
      <div className="panel-title">Riepilogo IVA (commercialista)</div>

      <div className="cards">
        <div className="card">
          <div className="label">Entrate istituzionali</div>
          <div className="value">{fmt.format(iva.summary.entrateIstituzionali)}</div>
        </div>

        <div className="card">
          <div className="label">Entrate commerciali</div>
          <div className="value">{fmt.format(iva.summary.entrateCommerciali)}</div>
        </div>

        <div className="card">
          <div className="label">Imponibile (solo C)</div>
          <div className="value">{fmt.format(iva.summary.imponibileCommerciale)}</div>
        </div>

        <div className="card">
          <div className="label">IVA (solo C)</div>
          <div className="value">{fmt.format(iva.summary.ivaCommerciale)}</div>
        </div>

        <div className="card">
          <div className="label">Totale (solo C)</div>
          <div className="value">{fmt.format(iva.summary.totaleCommerciale)}</div>
        </div>
      </div>
    </div>

    <div className="panel">
      <div className="panel-title">Dettaglio per aliquota (solo C)</div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Aliquota</th>
              <th className="num">Imponibile</th>
              <th className="num">IVA</th>
              <th className="num">Totale</th>
            </tr>
          </thead>
          <tbody>
            {(iva.byRate || []).map((r, idx) => (
              <tr key={idx}>
                <td>{r.vat_rate ?? r.vatRate ?? r.rate ?? ""}%</td>
                <td className="num">{fmt.format(Number(r.imponibile ?? r.taxable ?? 0))}</td>
                <td className="num">{fmt.format(Number(r.iva ?? r.vat ?? 0))}</td>
                <td className="num">{fmt.format(Number(r.totale ?? r.total ?? 0))}</td>
              </tr>
            ))}

            {(!iva.byRate || iva.byRate.length === 0) && (
              <tr>
                <td colSpan={4} className="muted">
                  Nessun dato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    <div className="panel">
      <div className="panel-title">Righe dettaglio (solo C)</div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrizione</th>
              <th className="num">Imponibile</th>
              <th className="num">IVA</th>
              <th className="num">Totale</th>
              <th>Aliquota</th>
            </tr>
          </thead>
          <tbody>
            {(iva.rows || []).map((r, idx) => (
              <tr key={idx}>
                <td>{r.date ?? r.data ?? ""}</td>
                <td>{r.description ?? r.descrizione ?? ""}</td>
                <td className="num">{fmt.format(Number(r.imponibile ?? r.taxable ?? 0))}</td>
                <td className="num">{fmt.format(Number(r.iva ?? r.vat ?? 0))}</td>
                <td className="num">{fmt.format(Number(r.totale ?? r.total ?? 0))}</td>
                <td>{r.vat_rate ?? r.vatRate ?? ""}%</td>
              </tr>
            ))}

            {(!iva.rows || iva.rows.length === 0) && (
              <tr>
                <td colSpan={6} className="muted">
                  Nessun dato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </>
) : null}

      {/* ELENCO FATTURE */}
      {tab === "fatture" ? (
        <div className="panel">
          <div className="panel-title">Elenco fatture</div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th className="num">Totale</th>
                  <th className="num">IVA</th>
                  <th className="num">Imponibile</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(invFiltered || []).map((r) => (
                  <tr key={r.id}>
                    <td>{`${r.year}/${String(r.number || "").padStart(4, "0")}`}</td>
                    <td>{r.issue_date || ""}</td>
                    <td>{r?.customer?.name || "—"}</td>
                    <td className="num">{fmt.format(Number(r.total || 0))}</td>
                    <td className="num">{fmt.format(Number(r.vat || 0))}</td>
                    <td className="num">{fmt.format(Number(r.subtotal || 0))}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn" type="button" onClick={() => openEditInvoice(r)}>
                          Modifica
                        </button>
                        <button className="btn" type="button" onClick={() => downloadInvoicePdf(r)}>
                          PDF
                        </button>
                        <button className="btn" type="button" onClick={() => setInvDeleteId(r.id)}>
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {(!invFiltered || invFiltered.length === 0) && (
                  <tr>
                    <td colSpan={7} className="muted">
                      {invLoading ? "Caricamento…" : "Nessuna fattura per i filtri selezionati."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* MODALE FATTURA */}
      {invModalOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeInvoiceModal()}>
          <div className="modal invoice-modal">
            <div className="modal-header">
              <h3>{invEditId ? "Modifica fattura" : "Nuova fattura"}</h3>
              <button className="btn" type="button" onClick={closeInvoiceModal}>
                Chiudi
              </button>
            </div>

            <div className="invoice-form">
              <div className="invoice-grid">
                <div className="invoice-card">
                  <h4>Dati fattura</h4>
                  <div className="row-3">
                    <label>
                      Anno
                      <input
                        type="number"
                        value={invoiceForm.year}
                        onChange={(e) => setInvoiceForm((s) => ({ ...s, year: e.target.value }))}
                        onBlur={() => setInvoiceForm((s) => ({ ...s, year: clampYear(s.year) }))}
                        disabled={!!invEditId}
                      />
                    </label>
                    <label>
                      Numero
                      <input type="number" value={invoiceForm.number} readOnly />
                    </label>
                    <label>
                      Data
                      <input type="date" value={invoiceForm.issue_date} onChange={(e) => setInvoiceForm((s) => ({ ...s, issue_date: e.target.value }))} />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Scadenza (opzionale)
                      <input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm((s) => ({ ...s, due_date: e.target.value }))} />
                    </label>
                    <label>
                      Valuta
                      <input type="text" value="EUR" readOnly />
                    </label>
                  </div>
                </div>

                <div className="invoice-card">
                  <h4>Cliente</h4>

                  <div className="inv-customer-tools" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <label className="inv-customer-search">
                      Cerca
                      <input type="text" value={invCustomerQuery} onChange={(e) => setInvCustomerQuery(e.target.value)} placeholder="Cerca cliente…" />
                    </label>

                    <label className="inv-customer-pick">
                      Seleziona
                      <select value={invCustomerPick} onChange={(e) => setInvCustomerPick(e.target.value)}>
                        <option value="">—</option>
                        {filteredInvCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || "Senza nome"}
                            {c.vat ? ` • P.IVA ${c.vat}` : c.cf ? ` • CF ${c.cf}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="muted small" style={{ marginTop: 6 }}>
                    L’anagrafica cliente si gestisce nella pagina “Fatture” (sopra).
                  </div>

                  {selectedCustomerPreview && (
                    <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,.86)" }}>
                      <div style={{ fontWeight: 700 }}>{selectedCustomerPreview.name || "—"}</div>
                      <div className="muted small">
                        {[selectedCustomerPreview.address, selectedCustomerPreview.city].filter(Boolean).join(" • ") || "—"}
                      </div>
                      <div className="muted small">
                        {[
                          selectedCustomerPreview.vat ? `P.IVA ${selectedCustomerPreview.vat}` : null,
                          selectedCustomerPreview.cf ? `CF ${selectedCustomerPreview.cf}` : null,
                          selectedCustomerPreview.sdi ? `SDI ${selectedCustomerPreview.sdi}` : null,
                        ].filter(Boolean).join(" • ") || "—"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="invoice-card">
                  <h4>Note</h4>
                  <label className="full">
                    Note (opzionale)
                    <textarea value={invoiceForm.notes} onChange={(e) => setInvoiceForm((s) => ({ ...s, notes: e.target.value }))} placeholder="es. riferimento pagamento, periodo affitto, ecc." />
                  </label>
                </div>
              </div>

              <div className="invoice-items">
                <div className="items-header">
                  <div>
                    <strong>Righe</strong>
                    <div className="muted small">Descrizione + quantità + prezzo + aliquota IVA.</div>
                  </div>
                  <button className="btn" type="button" onClick={addItem}>
                    + Riga
                  </button>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Descrizione</th>
                        <th className="num">Q.tà</th>
                        <th className="num">Prezzo</th>
                        <th className="num">IVA %</th>
                        <th>Modo IVA</th>
                        <th className="num">Totale</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(invoiceForm.items || []).map((it, idx) => {
                        const qty = Math.max(0, toNum(it.qty ?? 1));
                        const unit = toNum(it.unit_price ?? 0);
                        const vatRate = Math.max(0, toNum(it.vat_rate ?? 0));
                        const vatMode = String(it.vat_mode || "excluded");
                        const lineTotal = Number((vatMode === "included" ? qty * unit : qty * unit + (qty * unit * vatRate) / 100).toFixed(2));
                        return (
                          <tr key={idx}>
                            <td>
                              <input className="small-input" type="text" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Descrizione" />
                            </td>
                            <td className="num">
                              <input className="small-input" type="number" step="0.01" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                            </td>
                            <td className="num">
                              <input className="small-input" type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} />
                            </td>
                            <td className="num">
                              <select className="small-input" value={it.vat_rate} onChange={(e) => updateItem(idx, { vat_rate: e.target.value })}>
                                <option value={0}>0%</option>
                                <option value={10}>10%</option>
                                <option value={22}>22%</option>
                              </select>
                            </td>
                            <td>
                              <select className="small-input" value={it.vat_mode || "excluded"} onChange={(e) => updateItem(idx, { vat_mode: e.target.value })}>
                                <option value="excluded">IVA esclusa</option>
                                <option value="included">IVA compresa</option>
                              </select>
                            </td>
                            <td className="num">{fmt.format(lineTotal)}</td>
                            <td>
                              <button className="btn" type="button" onClick={() => removeItem(idx)}>
                                Rimuovi
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="invoice-totals">
                  <div className="box">
                    <div className="line">
                      <span>Imponibile</span>
                      <span>{fmt.format(invTotals.subtotal)}</span>
                    </div>
                    <div className="line">
                      <span>IVA</span>
                      <span>{fmt.format(invTotals.vat)}</span>
                    </div>
                    <div className="line">
                      <strong>Totale</strong>
                      <strong>{fmt.format(invTotals.total)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-buttons" style={{ marginTop: 14 }}>
                <button className="btn" type="button" onClick={closeInvoiceModal} disabled={invSaving}>
                  Annulla
                </button>
                <button className="btn btn-primary" type="button" onClick={saveInvoice} disabled={invSaving}>
                  {invSaving ? "Salvataggio…" : invEditId ? "Salva modifiche" : "Crea fattura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {/* MODALE CLIENTE */}
      {custModalOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeCustomerModal()}>
          <div className="modal invoice-modal">
            <div className="modal-header">
              <h3>{custEditId ? "Modifica cliente" : "Nuovo cliente"}</h3>
              <button className="btn" type="button" onClick={closeCustomerModal}>
                Chiudi
              </button>
            </div>

            <div className="invoice-form">
              <div className="invoice-grid">
                <div className="invoice-card">
                  <h4>Dati cliente</h4>

                  <div className="row">
                    <label className="full">
                      Ragione sociale
                      <input type="text" value={custDraft.name} onChange={(e) => setCustDraft((st) => ({ ...st, name: e.target.value }))} />
                    </label>
                  </div>

                  <div className="row">
                    <label>
                      Indirizzo
                      <input type="text" value={custDraft.address} onChange={(e) => setCustDraft((st) => ({ ...st, address: e.target.value }))} />
                    </label>
                    <label>
                      Città
                      <input type="text" value={custDraft.city} onChange={(e) => setCustDraft((st) => ({ ...st, city: e.target.value }))} />
                    </label>
                  </div>

                  <div className="row-3">
                    <label>
                      P.IVA
                      <input type="text" value={custDraft.vat} onChange={(e) => setCustDraft((st) => ({ ...st, vat: e.target.value }))} />
                    </label>
                    <label>
                      CF
                      <input type="text" value={custDraft.cf} onChange={(e) => setCustDraft((st) => ({ ...st, cf: e.target.value }))} />
                    </label>
                    <label>
                      SDI
                      <input type="text" value={custDraft.sdi} onChange={(e) => setCustDraft((st) => ({ ...st, sdi: e.target.value }))} />
                    </label>
                  </div>

                  <div className="row">
                    <label>
                      PEC
                      <input type="text" value={custDraft.pec} onChange={(e) => setCustDraft((st) => ({ ...st, pec: e.target.value }))} placeholder="opzionale" />
                    </label>
                    <label>
                      Email
                      <input type="email" value={custDraft.email} onChange={(e) => setCustDraft((st) => ({ ...st, email: e.target.value }))} placeholder="opzionale" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-buttons" style={{ marginTop: 14 }}>
                <button className="btn" type="button" onClick={closeCustomerModal}>
                  Annulla
                </button>
                <button className="btn btn-primary" type="button" onClick={saveCustomerHome}>
                  Salva cliente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

{/* MODAL: conferma delete */}
      {invDeleteId && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setInvDeleteId(null)}>
          <div className="modal">
            <p>Vuoi eliminare questa fattura? (azione irreversibile)</p>
            <div className="modal-buttons">
              <button className="btn" onClick={() => setInvDeleteId(null)}>
                Annulla
              </button>
              <button className="btn btn-primary" onClick={confirmDeleteInvoice}>
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}