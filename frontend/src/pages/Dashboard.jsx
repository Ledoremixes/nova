import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import '../styles/Dashboard.css';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#6366f1'];
const BAR_SNAPSHOT_KEY = 'bar_snapshot_v1';

export default function Dashboard({ token, isAdmin }) {
  // ✅ per utenti non admin: niente chiamate, niente importi
  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel-title">Dashboard</div>
        <div style={{ color: 'var(--muted)', marginTop: 6 }}>
          Dashboard semplificata (utente).
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="cards">
            <div className="card">
              <div className="label">Accesso</div>
              <div className="value">Utente</div>
            </div>

            <div className="card">
              <div className="label">Sezioni abilitate</div>
              <div className="value">Tesserati • Insegnanti</div>
            </div>

            <div className="card">
              <div className="label">Note</div>
              <div className="value" style={{ fontSize: 14 }}>
                Nessun importo visibile per questo profilo.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  // Mappa conti: "AS" -> descrizione
  const [accountsMap, setAccountsMap] = useState({});

  // BAR (manual load)
  const [bar, setBar] = useState(null);
  const [barLoading, setBarLoading] = useState(false);
  const [barError, setBarError] = useState('');

  // Snapshot (istantaneo, senza chiamate)
  const [barSnapshot, setBarSnapshot] = useState(null);

  const fmt = useMemo(() => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  }, []);

  // 1) Dashboard stats
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError('');
        setStats(null);

        const data = await api.getDashboardStats(token);
        if (!alive) return;
        setStats(data);
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Errore caricando la dashboard');
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  // 2) Carico i conti (per legenda chiara)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await api.getAccounts(token);
        if (!alive) return;

        const accounts = Array.isArray(res) ? res : (res?.data || res?.accounts || []);

        const map = {};
        (accounts || []).forEach((a) => {
          const code = (a.code || a.account_code || '').toString().trim();
          const desc = (a.description || a.name || a.label || '').toString().trim();
          if (code) map[code] = desc || code;
        });

        setAccountsMap(map);
      } catch {
        if (!alive) return;
        setAccountsMap({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  // 3) Snapshot Bar da localStorage (istantaneo)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BAR_SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.barItemsTop) setBarSnapshot(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  async function loadBar(forceRefresh = false) {
    try {
      setBarError('');
      setBarLoading(true);

      // ✅ FIX: la tua api.getBarStats ha signature (token, filters = {}, forceRefresh = false)
      const data = await api.getBarStats(token, {}, forceRefresh);

      setBar(data);

      // salva snapshot
      try {
        localStorage.setItem(BAR_SNAPSHOT_KEY, JSON.stringify(data));
        setBarSnapshot(data);
      } catch {
        // ignore
      }
    } catch (err) {
      setBarError(err.message || 'Errore caricando i dati Bar');
    } finally {
      setBarLoading(false);
    }
  }

  const barItemsTop = (bar?.barItemsTop || []);
  const snapshotItemsTop = (barSnapshot?.barItemsTop || []);

  const pieData = (stats?.byAccount || [])
    .filter(x => Number(x.entrate || 0) > 0)
    .map(x => {
      const code = (x.code || '').toString().trim();
      const desc = accountsMap[code] ? ` — ${accountsMap[code]}` : '';
      return {
        ...x,
        code,
        label: `${code}${desc}`,
      };
    });

  const pieTotal = pieData.reduce((s, x) => s + Number(x.entrate || 0), 0);

  if (!stats) {
    return (
      <div className="panel">
        <div className="panel-title">Dashboard</div>
        <div style={{ color: 'var(--muted)' }}>Caricamento…</div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    );
  }

  const hasLiveBar = bar !== null;
  const hasSnapshot = !hasLiveBar && snapshotItemsTop.length > 0;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Dashboard</h2>
          <p>Panoramica rapida: KPI + grafici principali.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        <div className="panel-title">KPI</div>

        <div className="cards">
          <div className="card">
            <div className="label">Entrate totali</div>
            <div className="value green">{fmt.format(stats.totalEntrate)}</div>
          </div>

          <div className="card">
            <div className="label">Uscite totali</div>
            <div className="value red">{fmt.format(stats.totalUscite)}</div>
          </div>

          <div className="card">
            <div className="label">Saldo</div>
            <div className="value">{fmt.format(stats.saldo)}</div>
          </div>

          <div className="card">
            <div className="label">Movimenti registrati</div>
            <div className="value">{stats.totalMovements}</div>
          </div>
        </div>
      </div>

      <div className="charts-row">
        {/* PIE */}
        <div className="chart-card">
          <h3>Entrate per conto</h3>

          <div className="pieWrap">
            <div className="pieChartBox">
              <ResponsiveContainer width="100%" height={360}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="entrate"
                    nameKey="label"
                    outerRadius={120}
                    labelLine={false}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip formatter={(value) => fmt.format(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="pieLegendBox">
              <div className="pieLegendTitle">Legenda</div>

              <ul className="pieLegendList">
                {pieData.map((item, idx) => {
                  const v = Number(item.entrate || 0);
                  const perc = pieTotal ? (v / pieTotal) * 100 : 0;

                  return (
                    <li className="pieLegendItem" key={item.code || `${idx}`}>
                      <span
                        className="pieLegendDot"
                        style={{ background: COLORS[idx % COLORS.length] }}
                      />
                      <div className="pieLegendText">
                        <div className="pieLegendLabel">{item.label}</div>
                        <div className="pieLegendMeta">
                          {fmt.format(v)} • {perc.toFixed(0)}%
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* BAR (solo su click) */}
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Top articoli Bar (per incasso)</h3>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {!hasLiveBar && (
                <button
                  className="btn"
                  onClick={() => loadBar(false)}
                  disabled={barLoading}
                  title="Carica i dati Bar (usa cache se disponibile)"
                >
                  {barLoading ? 'Carico…' : 'Carica'}
                </button>
              )}

              {hasLiveBar && (
                <button
                  className="btn"
                  onClick={() => loadBar(true)}
                  disabled={barLoading}
                  title="Forza aggiornamento dati Bar (più pesante)"
                >
                  {barLoading ? 'Aggiorno…' : 'Aggiorna'}
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            {hasLiveBar
              ? `Fonte: ${bar.source} — Ultimo update: ${new Date(bar.updated_at).toLocaleString()}`
              : hasSnapshot
                ? `Snapshot (ultimo dato salvato): ${barSnapshot?.updated_at ? new Date(barSnapshot.updated_at).toLocaleString() : '—'}`
                : 'Non caricato: clicca “Carica” per visualizzare il grafico.'}
          </div>

          {barError && <div className="error" style={{ marginTop: 10 }}>{barError}</div>}

          <div style={{ marginTop: 10 }}>
            {hasLiveBar ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barItemsTop}>
                    <XAxis dataKey="label" hide />
                    <YAxis />
                    <Tooltip formatter={(value) => fmt.format(value)} />
                    <Bar dataKey="amount" />
                  </BarChart>
                </ResponsiveContainer>

                <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                  Dettaglio
                </div>

                <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                  {barItemsTop.length === 0 && (
                    <li style={{ color: 'var(--muted)' }}>
                      {barLoading ? 'Caricamento…' : 'Nessun dato bar disponibile.'}
                    </li>
                  )}

                  {barItemsTop.map(item => (
                    <li key={item.label} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      : {fmt.format(item.amount)}{' '}
                      <span style={{ color: 'var(--muted)' }}>({item.count} pezzi)</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : hasSnapshot ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={snapshotItemsTop}>
                    <XAxis dataKey="label" hide />
                    <YAxis />
                    <Tooltip formatter={(value) => fmt.format(value)} />
                    <Bar dataKey="amount" />
                  </BarChart>
                </ResponsiveContainer>

                <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                  Dettaglio (snapshot)
                </div>

                <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                  {snapshotItemsTop.map(item => (
                    <li key={item.label} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      : {fmt.format(item.amount)}{' '}
                      <span style={{ color: 'var(--muted)' }}>({item.count} pezzi)</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                border: '1px dashed var(--border)',
                color: 'var(--muted)'
              }}>
                Grafico Bar disattivato all’avvio per velocizzare la dashboard. Premi <b>Carica</b> se ti serve.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
