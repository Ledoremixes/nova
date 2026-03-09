const express = require('express');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();
router.use(auth);

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

// ==============================
// 1) ADMIN DASHBOARD (con €)
// GET /api/dashboard
// ==============================
router.get('/', requireAdmin, async (req, res) => {
  try {
    // Totali calcolati da Postgres (niente fetch massivo)
    const totalsRaw = await rpc('report_global_totals', {
      p_user_id: req.user.id,
      p_from: null,
      p_to: null,
    });

    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    const totalEntrate = Number(num(t.total_entrate).toFixed(2));
    const totalUscite = Number(num(t.total_uscite).toFixed(2));
    const saldo = Number(num(t.saldo).toFixed(2));
    const totalVat = Number(num(t.total_vat).toFixed(2));

    // Count movimenti (veloce)
    const { count, error: countErr } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (countErr) {
      console.warn('Count entries error:', countErr);
    }

    res.json({
      totalEntrate,
      totalUscite,
      saldo,
      totalVat,
      totalMovements: count ?? 0,
      // alias per compatibilità
      totalIn: totalEntrate,
      totalOut: totalUscite,
      balance: saldo,
    });
  } catch (err) {
    console.error('Errore /dashboard:', err.details || err);
    res.status(500).json({ error: 'Errore dashboard' });
  }
});

// ==============================
// 2) USER DASHBOARD (NO €) - TUTTI AUTENTICATI
// GET /api/dashboard/public
// ==============================
router.get('/public', async (req, res) => {
  try {
    const todayISO = toISODateOrNull(new Date());
    const startToday = todayISO ? `${todayISO}T00:00:00.000Z` : null;
    const endToday = todayISO ? `${todayISO}T23:59:59.999Z` : null;

    const [
      totalTesserati,
      totalInsegnanti,
      tesseramentiOggi,
      tesseratiDaCompletare,
      ultimiTesserati,
    ] = await Promise.all([
      supabase
        .from('tesserati')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id),
      supabase
        .from('teachers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id),
      supabase
        .from('tesserati')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .gte('created_at', startToday)
        .lte('created_at', endToday),
      supabase
        .from('tesserati')
        .select('id, nome, cognome, stato, created_at')
        .eq('user_id', req.user.id),
      supabase
        .from('tesserati')
        .select('id, nome, cognome, stato, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const errors = [
      totalTesserati.error,
      totalInsegnanti.error,
      tesseramentiOggi.error,
      tesseratiDaCompletare.error,
      ultimiTesserati.error,
    ].filter(Boolean);

    if (errors.length) {
      console.error('Errore /dashboard/public:', errors[0]);
      return res.status(500).json({ error: 'Errore dashboard pubblica' });
    }

    // tesseramenti da completare: stato diverso da 'completo' o 'completato'
    const incompleti = (tesseratiDaCompletare.data || []).filter((x) => {
      const s = String(x.stato || '').toLowerCase();
      return s && s !== 'completo' && s !== 'completato';
    });

    const ultimi = (ultimiTesserati.data || []).map((x) => {
      const stato = String(x.stato || '');
      return {
        id: x.id,
        nome: `${x.nome || ''} ${x.cognome || ''}`.trim(),
        data: x.created_at ? new Date(x.created_at).toLocaleDateString('it-IT') : '',
        stato,
      };
    });

    res.json({
      totalTesserati: totalTesserati.count || 0,
      totalInsegnanti: totalInsegnanti.count || 0,
      tesseramentiOggi: tesseramentiOggi.count || 0,
      tesseramentiDaCompletare: incompleti.length,
      ultimiTesserati: ultimi,
    });
  } catch (err) {
    console.error('Errore /dashboard/public:', err);
    res.status(500).json({ error: 'Errore dashboard pubblica' });
  }
});

module.exports = router;
