import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function Bilancio({ token }) {
  // tab: "rendiconto" | "iva"
  const [tab, setTab] = useState('rendiconto');

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

  // REPORT IVA (commercialista)
  // - mostra entrate istituzionali vs commerciali
  // - IVA calcolata solo su commerciale (conto C)
  const [iva, setIva] = useState({
    summary: {
      entrateIstituzionali: 0,
      entrateCommerciali: 0,
      imponibileCommerciale: 0,
      ivaCommerciale: 0,
      totaleCommerciale: 0,
    },
    byRate: [], // righe per aliquota (solo C)
    rows: [], // righe dettagliate (solo C)
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fmt = useMemo(() => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  }, []);

  function safeArray(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') return Object.values(x);
    return [];
  }

  async function loadRendiconto() {
    try {
      setError('');
      setLoading(true);

      const data = await api.getReportSummary(token, {
        from: fromDate || undefined,
        to: toDate || undefined,
      });

      const root = data?.data ?? data;

      let detailRows =
        root?.rows ??
        root?.perAccount ??
        root?.perAccountRows ??
        root?.detailRows ??
        root?.accounts ??
        [];

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
      setError(err?.message || 'Errore nel caricamento del rendiconto');
      setSummary((s) => ({
        ...s,
        rows: [],
        totalEntrate: 0,
        totalUscite: 0,
        saldo: 0,
        totalEntrateIstituzionali: 0,
        totalEntrateCommerciali: 0,
        totalVat: 0,
      }));
    } finally {
      setLoading(false);
    }
  }

  async function loadIva() {
    try {
      setError('');
      setLoading(true);

      // ✅ Nuovo flusso "commercialista":
      // - summary (entrate ist/comm + imponibile/iva/totale su C)
      // - byRate (aliquota)
      // - rows (dettaglio)
      // Se non hai ancora aggiunto questi metodi in api.js, puoi usare fetch diretto (vedi sotto).
      let payload;

      if (api.getIvaCommercialista) {
        payload = await api.getIvaCommercialista(token, {
          from: fromDate || undefined,
          to: toDate || undefined,
        });
      } else {
        // fallback fetch diretto
        const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const params = new URLSearchParams();
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        const q = params.toString() ? `?${params.toString()}` : '';

        const res = await fetch(`${base}/reportIva/data${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || 'Errore nel caricamento del report IVA');
        }
        payload = await res.json();
      }

      const root = payload?.data ?? payload;

      setIva({
        summary: {
          entrateIstituzionali: Number(
            root?.summary?.entrate_istituzionali ??
              root?.summary?.entrateIstituzionali ??
              0
          ),
          entrateCommerciali: Number(
            root?.summary?.entrate_commerciali ??
              root?.summary?.entrateCommerciali ??
              0
          ),
          imponibileCommerciale: Number(
            root?.summary?.imponibile_commerciale ??
              root?.summary?.imponibileCommerciale ??
              0
          ),
          ivaCommerciale: Number(
            root?.summary?.iva_commerciale ?? root?.summary?.ivaCommerciale ?? 0
          ),
          totaleCommerciale: Number(
            root?.summary?.totale_commerciale ??
              root?.summary?.totaleCommerciale ??
              0
          ),
        },
        byRate: safeArray(root?.byRate ?? root?.by_rate ?? []),
        rows: safeArray(root?.rows ?? []),
      });
    } catch (err) {
      setError(err?.message || 'Errore nel caricamento del report IVA');
      setIva({
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (tab === 'rendiconto') loadRendiconto();
    else loadIva();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  function handleSubmit(e) {
    e.preventDefault();
    if (tab === 'rendiconto') loadRendiconto();
    else loadIva();
  }

  function handleReset() {
    setFromDate('');
    setToDate('');
    setTimeout(() => {
      if (tab === 'rendiconto') loadRendiconto();
      else loadIva();
    }, 0);
  }

  async function handleExport(format) {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const q = params.toString() ? `?${params.toString()}` : '';
      const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

      // ✅ Export:
      // - rendiconto -> /report/export/{xlsx|pdf}
      // - iva commercialista -> /reportIva/pdf (solo pdf) oppure /reportIva/export/pdf
      let url = '';

      if (tab === 'rendiconto') {
        url = `${base}/report/export/${format}${q}`;
      } else {
        // preferisci PDF “bello” per commercialista
        if (format === 'pdf') url = `${base}/reportIva/pdf${q}`;
        else url = `${base}/reportIva/export/${format}${q}`; // se farai anche xlsx
      }

      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        alert("Errore durante l'export: " + text);
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;

      if (tab === 'rendiconto') {
        a.download = format === 'xlsx' ? 'rendiconto_orchidea.xlsx' : 'rendiconto_orchidea.pdf';
      } else {
        a.download = format === 'xlsx' ? 'report_iva_commercialista.xlsx' : 'report_iva_commercialista.pdf';
      }

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("Errore durante l'export: " + (err?.message || ''));
    }
  }

  const {
    rows,
    totalEntrate,
    totalUscite,
    saldo,
    totalEntrateIstituzionali,
    totalEntrateCommerciali,
    totalVat,
  } = summary;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Contabilità</h2>
          <p>Rendiconto finanziario + Report IVA per commercialista.</p>
        </div>

        <div className="page-actions">
          <button className="btn" type="button" onClick={() => handleExport('xlsx')}>
            Esporta Excel
          </button>
          <button className="btn btn-primary" type="button" onClick={() => handleExport('pdf')}>
            Esporta PDF
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Sezione</div>

        <div className="toolbar toolbar-wrap">
          <div className="tabs">
            <button
              className={`tab-btn ${tab === 'rendiconto' ? 'active' : ''}`}
              type="button"
              onClick={() => setTab('rendiconto')}
            >
              Rendiconto
            </button>

            <button
              className={`tab-btn ${tab === 'iva' ? 'active' : ''}`}
              type="button"
              onClick={() => setTab('iva')}
            >
              Report IVA (commercialista)
            </button>
          </div>
        </div>
      </div>

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
                {loading ? 'Caricamento…' : 'Filtra'}
              </button>
              <button className="btn" type="button" onClick={handleReset} disabled={loading}>
                Reset
              </button>
            </div>
          </div>
        </form>

        {error && <div className="error">{error}</div>}
      </div>

      {tab === 'rendiconto' ? (
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
                  {rows.map((r) => (
                    <tr key={r.code}>
                      <td className="nowrap">{r.code}</td>
                      <td>{r.name}</td>
                      <td className="nowrap">{r.type || '-'}</td>
                      <td className="num">{fmt.format(Number(r.entrate || 0))}</td>
                      <td className="num">{fmt.format(Number(r.uscite || 0))}</td>
                      <td className="num">{fmt.format(Number(r.saldo || 0))}</td>
                      <td className="num">{fmt.format(Number(r.entrateIstituzionali || 0))}</td>
                      <td className="num">{fmt.format(Number(r.entrateCommerciali || 0))}</td>
                      <td className="num">{fmt.format(Number(r.vatAmount || 0))}</td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan="9">Nessun movimento nel periodo selezionato</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="panel">
            <div className="panel-title">Riepilogo (commercialista)</div>

            <div className="cards">
              <div className="card">
                <div className="label">Entrate istituzionali</div>
                <div className="value">{fmt.format(Number(iva.summary.entrateIstituzionali || 0))}</div>
              </div>
              <div className="card">
                <div className="label">Entrate commerciali (Bar - C)</div>
                <div className="value">{fmt.format(Number(iva.summary.entrateCommerciali || 0))}</div>
              </div>
              <div className="card">
                <div className="label">Imponibile commerciale</div>
                <div className="value">{fmt.format(Number(iva.summary.imponibileCommerciale || 0))}</div>
              </div>
              <div className="card">
                <div className="label">IVA commerciale</div>
                <div className="value">{fmt.format(Number(iva.summary.ivaCommerciale || 0))}</div>
              </div>
              <div className="card">
                <div className="label">Totale commerciale</div>
                <div className="value">{fmt.format(Number(iva.summary.totaleCommerciale || 0))}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Dettaglio per aliquota (solo Bar - C)</div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Aliquota</th>
                    <th className="num">Imponibile</th>
                    <th className="num">IVA</th>
                    <th className="num">Totale</th>
                    <th className="num">N. righe</th>
                  </tr>
                </thead>

                <tbody>
                  {iva.byRate.map((r, idx) => (
                    <tr key={`${r.vat_rate ?? 'x'}-${idx}`}>
                      <td className="nowrap">{r.vat_rate != null ? `${Number(r.vat_rate).toFixed(0)}%` : '—'}</td>
                      <td className="num">{fmt.format(Number(r.imponibile || 0))}</td>
                      <td className="num">{fmt.format(Number(r.iva || 0))}</td>
                      <td className="num">{fmt.format(Number(r.totale || 0))}</td>
                      <td className="num">{Number(r.count || 0)}</td>
                    </tr>
                  ))}

                  {iva.byRate.length === 0 && (
                    <tr>
                      <td colSpan="5">Nessuna riga IVA nel periodo selezionato</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Righe (solo Bar - C)</div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th className="num">Aliquota</th>
                    <th className="num">Imponibile</th>
                    <th className="num">IVA</th>
                    <th className="num">Totale</th>
                  </tr>
                </thead>

                <tbody>
                  {iva.rows.map((r, idx) => (
                    <tr key={`${r.date}-${idx}`}>
                      <td className="nowrap">{r.date}</td>
                      <td>{r.description}</td>
                      <td className="num">{r.vat_rate != null ? `${Number(r.vat_rate).toFixed(0)}%` : '—'}</td>
                      <td className="num">{fmt.format(Number(r.imponibile || 0))}</td>
                      <td className="num">{fmt.format(Number(r.iva || 0))}</td>
                      <td className="num">{fmt.format(Number(r.totale || 0))}</td>
                    </tr>
                  ))}

                  {iva.rows.length === 0 && (
                    <tr>
                      <td colSpan="6">Nessuna riga IVA nel periodo selezionato</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
              Nota: il report IVA del commercialista mostra la divisione tra <b>entrate istituzionali</b> e{' '}
              <b>entrate commerciali</b>. L’IVA è calcolata e mostrata solo sulle entrate commerciali del Bar (conto{' '}
              <b>C</b>).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
