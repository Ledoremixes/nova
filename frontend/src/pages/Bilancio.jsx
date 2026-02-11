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
    totalVat: 0
  });

  // REPORT IVA
  const [iva, setIva] = useState({
    // ✅ qui dentro mettiamo il riepilogo (summaryRows)
    rows: [],
    totals: { imponibile: 0, iva: 0, totale: 0 },
    // (opzionale per il futuro) dettaglio conti
    detailRows: []
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');

  const fmt = useMemo(() => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  }, []);

  async function loadRendiconto() {
    try {
      setError('');
      const data = await api.getReportSummary(token, {
        from: fromDate || undefined,
        to: toDate || undefined
      });

      setSummary({
        rows: data.rows || [],
        totalEntrate: Number(data.totalEntrate || 0),
        totalUscite: Number(data.totalUscite || 0),
        saldo: Number(data.saldo || 0),
        totalEntrateIstituzionali: Number(data.totalEntrateIstituzionali || 0),
        totalEntrateCommerciali: Number(data.totalEntrateCommerciali || 0),
        totalVat: Number(data.totalVat || 0)
      });
    } catch (err) {
      setError(err.message || 'Errore nel caricamento del rendiconto');
    }
  }

  async function loadIva() {
    try {
      setError('');
      const data = await api.getIvaMonthlyByNature(token, {
        from: fromDate || undefined,
        to: toDate || undefined
      });

      // ✅ FIX: il backend ritorna summaryRows e detailRows, non "rows"
      setIva({
        rows: data.summaryRows || [],
        detailRows: data.detailRows || [],
        totals: data.totals || { imponibile: 0, iva: 0, totale: 0 },
      });
    } catch (err) {
      setError(err.message || 'Errore nel caricamento del report IVA');
    }
  }

  useEffect(() => {
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

      const url =
        tab === 'rendiconto'
          ? `${base}/report/export/${format}${q}`
          : `${base}/report/iva/export/${format}${q}`;

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
        a.download = format === 'xlsx' ? 'report_iva_mensile_natura.xlsx' : 'report_iva_mensile_natura.pdf';
      }

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("Errore durante l'export: " + (err.message || ''));
    }
  }

  const {
    rows,
    totalEntrate,
    totalUscite,
    saldo,
    totalEntrateIstituzionali,
    totalEntrateCommerciali,
    totalVat
  } = summary;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Contabilità</h2>
          <p>
            Rendiconto finanziario + Report IVA mensile per natura (per commercialista).
          </p>
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
              className={`tab-btn ${tab === "rendiconto" ? "active" : ""}`}
              type="button"
              onClick={() => setTab("rendiconto")}
            >
              Rendiconto
            </button>

            <button
              className={`tab-btn ${tab === "iva" ? "active" : ""}`}
              type="button"
              onClick={() => setTab("iva")}
            >
              Report IVA (mensile per natura)
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
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
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
            </div>

            <div className="toolbar-buttons">
              <button className="btn btn-primary" type="submit">
                Filtra
              </button>
              <button className="btn" type="button" onClick={handleReset}>
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
                <div className="label">IVA totale</div>
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
                  {rows.map(r => (
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
            <div className="panel-title">Riepilogo IVA (filtrato)</div>

            <div className="cards">
              <div className="card">
                <div className="label">Imponibile totale</div>
                <div className="value">{fmt.format(Number(iva.totals.imponibile || 0))}</div>
              </div>
              <div className="card">
                <div className="label">IVA totale</div>
                <div className="value">{fmt.format(Number(iva.totals.iva || 0))}</div>
              </div>
              <div className="card">
                <div className="label">Totale (imponibile + IVA)</div>
                <div className="value">{fmt.format(Number(iva.totals.totale || 0))}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Report mensile per natura</div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th>Natura</th>
                    <th className="num">Aliquota</th>
                    <th className="num">Imponibile</th>
                    <th className="num">IVA</th>
                    <th className="num">Totale</th>
                    <th className="num">N. movimenti</th>
                  </tr>
                </thead>

                <tbody>
                  {iva.rows.map((r, idx) => (
                    <tr key={`${r.month}-${r.nature}-${r.vatRate}-${idx}`}>
                      <td className="nowrap">{r.month}</td>
                      <td>{r.nature}</td>
                      <td className="num">{r.vatRate != null ? `${r.vatRate}%` : '-'}</td>
                      <td className="num">{fmt.format(Number(r.imponibile || 0))}</td>
                      <td className="num">{fmt.format(Number(r.iva || 0))}</td>
                      <td className="num">{fmt.format(Number(r.totale || 0))}</td>
                      <td className="num">{Number(r.count || 0)}</td>
                    </tr>
                  ))}

                  {iva.rows.length === 0 && (
                    <tr>
                      <td colSpan="7">Nessun movimento IVA nel periodo selezionato</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
              Nota: questo report raggruppa per <b>mese</b> e <b>natura</b>. Se in un mese/natura hai più aliquote,
              troverai più righe (una per aliquota).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
