const express = require('express');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ✅ Config: quali conti considerare "Bar" (se i tuoi movimenti bar non sono su C, aggiungi qui)
const BAR_ACCOUNT_CODES = ['C']; // es: ['C','I']

// ✅ Cache in-memory (veloce). Nota: si resetta se riavvii il server.
const cache = new Map(); // key -> { ts, data }
const BAR_TTL_MS = 10 * 60 * 1000;

// ----------------------
// Helpers
// ----------------------
function toISODateOrNull(x) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function rpc(fnName, params) {
  const { data, error } = await supabase.rpc(fnName, params);
  if (error) {
    const e = new Error(error.message || 'RPC error');
    e.details = error;
    throw e;
  }
  return data || [];
}

// =======================
// GET /api/stats/dashboard
// =======================
//
// ✅ FIX: il tuo progetto non deve dipendere dal singolo utente.
// Questa route ora prova:
// 1) RPC dashboard_stats con p_user_id: null (globale)
// 2) RPC dashboard_stats senza parametri (compat)
// 3) Fallback: report_global_totals + count varie tabelle
//
router.get('/dashboard', async (_req, res) => {
  try {
    // 1) prova firma "globale"
    try {
      const { data, error } = await supabase.rpc('dashboard_stats', { p_user_id: null });
      if (!error) return res.json(data || {});
      console.warn('dashboard_stats(p_user_id:null) error:', error);
    } catch (e) {
      console.warn('dashboard_stats(p_user_id:null) throw:', e.details || e);
    }

    // 2) prova firma senza parametri (come era prima)
    try {
      const { data, error } = await supabase.rpc('dashboard_stats', {});
      if (!error) return res.json(data || {});
      console.warn('dashboard_stats({}) error:', error);
    } catch (e) {
      console.warn('dashboard_stats({}) throw:', e.details || e);
    }

    // 3) fallback robusto (senza dashboard_stats)
    const totalsRaw = await rpc('report_global_totals', {
      p_user_id: null,
      p_from: null,
      p_to: null,
    });

    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    const totalEntrate = Number(num(t.total_entrate).toFixed(2));
    const totalUscite = Number(num(t.total_uscite).toFixed(2));
    const saldo = Number(num(t.saldo).toFixed(2));
    const totalVat = Number(num(t.total_vat).toFixed(2));

    const [
      tesseratiCount,
      teachersCount,
      entriesCount,
      invoicesCount,
    ] = await Promise.all([
      supabase.from('tesserati').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('id', { count: 'exact', head: true }),
      supabase.from('entries').select('id', { count: 'exact', head: true }),
      supabase.from('invoices').select('id', { count: 'exact', head: true }),
    ]);

    const payload = {
      totalEntrate,
      totalUscite,
      saldo,
      totalVat,
      totalTesserati: tesseratiCount.count || 0,
      totalInsegnanti: teachersCount.count || 0,
      totalMovements: entriesCount.count || 0,
      totalInvoices: invoicesCount.count || 0,
      // alias compat
      totalIn: totalEntrate,
      totalOut: totalUscite,
      balance: saldo,
    };

    return res.json(payload);
  } catch (err) {
    console.error('Errore /stats/dashboard (fallback):', err.details || err);
    res.status(500).json({ error: 'Errore stats dashboard' });
  }
});

// =======================
// GET /api/stats/bar
// =======================
router.get('/bar', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));

    // ✅ cache globale (non dipende dall'utente)
    const key = JSON.stringify({ from, to, limit, codes: BAR_ACCOUNT_CODES });
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && now - cached.ts < BAR_TTL_MS) {
      return res.json({ ...cached.data, cached: true });
    }

    const rows = await rpc('bar_top_items', {
      p_from: from,
      p_to: to,
      p_bar_account_codes: BAR_ACCOUNT_CODES,
      p_limit: limit,
    });

    const items = (rows || []).map((r) => ({
      label: r.label,
      amount: Number(num(r.amount).toFixed(2)),
      count: Number(r.count || 0),
    }));

    const total = items.reduce((s, x) => s + num(x.amount), 0);

    const payload = {
      items,
      total: Number(total.toFixed(2)),
      meta: { from, to, limit, barAccountCodes: BAR_ACCOUNT_CODES },
      cached: false,
    };

    cache.set(key, { ts: now, data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('Errore /stats/bar:', err.details || err);
    res.status(500).json({ error: 'Errore stats bar' });
  }
});

module.exports = router;
