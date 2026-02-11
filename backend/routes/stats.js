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
// - già basato su RPC dashboard_stats in Supabase
// =======================
router.get('/dashboard', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('dashboard_stats', {
      p_user_id: req.user.id,
    });

    if (error) {
      console.error('Errore RPC dashboard_stats:', error);
      return res.status(500).json({ error: 'Errore stats dashboard' });
    }

    return res.json(data || {});
  } catch (err) {
    console.error('Errore /stats/dashboard:', err);
    res.status(500).json({ error: 'Errore stats dashboard' });
  }
});

// =======================
// GET /api/stats/bar
// - ora calcola tutto su Supabase (RPC bar_top_items)
// =======================
router.get('/bar', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));

    const key = JSON.stringify({ uid: req.user.id, from, to, limit, codes: BAR_ACCOUNT_CODES });
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && now - cached.ts < BAR_TTL_MS) {
      return res.json({ ...cached.data, cached: true });
    }

    const rows = await rpc('bar_top_items', {
      p_user_id: req.user.id,
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
