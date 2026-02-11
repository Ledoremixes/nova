const express = require('express');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

function norm(v) {
  return (v ?? '').toString().trim();
}
function normEmail(v) {
  return norm(v).toLowerCase();
}
function normCF(v) {
  const s = norm(v).toUpperCase().replace(/\s+/g, '');
  return s || null;
}

function pickCore(row) {
  return {
    nome: norm(row.nome),
    cognome: norm(row.cognome),
    cod_fiscale: normCF(row.cod_fiscale),
    cellulare: norm(row.cellulare),
    indirizzo: norm(row.indirizzo),
    citta: norm(row.citta),
    email: normEmail(row.email),
    tipo: norm(row.tipo) || 'Tesserato',
    anno: norm(row.anno) || '25/26',
    pagamento: norm(row.pagamento),
    note: norm(row.note),
  };
}

// GET /api/tesserati
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tesserati')
      .select('*')
      .eq('user_id', req.user.id)
      .order('cognome', { ascending: true })
      .order('nome', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /tesserati', e);
    res.status(500).json({ error: 'Errore caricando tesserati' });
  }
});

// POST /api/tesserati
router.post('/', async (req, res) => {
  try {
    const payload = pickCore(req.body || {});

    // scarta SOLO righe totalmente vuote
    const hasAny =
      (payload.nome && String(payload.nome).trim()) ||
      (payload.cognome && String(payload.cognome).trim()) ||
      (payload.cod_fiscale && String(payload.cod_fiscale).trim()) ||
      (payload.cellulare && String(payload.cellulare).trim()) ||
      (payload.email && String(payload.email).trim()) ||
      (payload.indirizzo && String(payload.indirizzo).trim()) ||
      (payload.citta && String(payload.citta).trim()) ||
      (payload.note && String(payload.note).trim());

    if (!hasAny) {
      return res.status(400).json({ error: 'Riga vuota: nessun dato da salvare' });
    }

    if (payload.cod_fiscale) {
      payload.cod_fiscale = String(payload.cod_fiscale).trim().toUpperCase().replace(/\s+/g, '');
    }

    const { data, error } = await supabase
      .from('tesserati')
      .insert([{ ...payload, user_id: req.user.id }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /tesserati', e);

    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('duplicate') || (e?.code || '') === '23505') {
      return res.status(409).json({ error: 'Dato duplicato (es. codice fiscale già presente)' });
    }

    res.status(500).json({ error: 'Errore creazione tesserato' });
  }
});

// PATCH /api/tesserati/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = pickCore(req.body || {});

    const hasAny =
      (payload.nome && String(payload.nome).trim()) ||
      (payload.cognome && String(payload.cognome).trim()) ||
      (payload.cod_fiscale && String(payload.cod_fiscale).trim()) ||
      (payload.cellulare && String(payload.cellulare).trim()) ||
      (payload.email && String(payload.email).trim()) ||
      (payload.indirizzo && String(payload.indirizzo).trim()) ||
      (payload.citta && String(payload.citta).trim()) ||
      (payload.note && String(payload.note).trim()) ||
      (payload.tipo && String(payload.tipo).trim()) ||
      (payload.anno && String(payload.anno).trim()) ||
      (payload.pagamento && String(payload.pagamento).trim());

    if (!hasAny) {
      return res.status(400).json({ error: 'Aggiornamento vuoto: nessun dato da salvare' });
    }

    if (payload.cod_fiscale) {
      payload.cod_fiscale = String(payload.cod_fiscale).trim().toUpperCase().replace(/\s+/g, '');
    }

    const { data, error } = await supabase
      .from('tesserati')
      .update(payload)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('PATCH /tesserati/:id', e);

    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('duplicate') || (e?.code || '') === '23505') {
      return res.status(409).json({ error: 'Dato duplicato (es. codice fiscale già presente)' });
    }

    res.status(500).json({ error: 'Errore aggiornamento tesserato' });
  }
});

// DELETE /api/tesserati/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await supabase
      .from('tesserati')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.status(204).send();
  } catch (e) {
    console.error('DELETE /tesserati/:id', e);
    res.status(500).json({ error: 'Errore eliminazione tesserato' });
  }
});

/**
 * IMPORT - PREVIEW
 * POST /api/tesserati/import/preview
 */
router.post('/import/preview', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.json({ validRows: [], conflicts: [], duplicatesInFile: [] });

    const normalized = rows.map((r) => pickCore(r));

    const seen = new Map(); // cf -> first row
    const duplicatesInFile = [];
    const uniqueCF = new Set();

    for (const r of normalized) {
      const cf = normCF(r.cod_fiscale);
      if (!cf) continue;
      if (seen.has(cf)) duplicatesInFile.push({ incoming: r, firstOccurrence: seen.get(cf) });
      else {
        seen.set(cf, r);
        uniqueCF.add(cf);
      }
    }

    const cfList = Array.from(uniqueCF);
    if (cfList.length === 0) {
      return res.json({ validRows: normalized, conflicts: [], duplicatesInFile });
    }

    const { data: existing, error } = await supabase
      .from('tesserati')
      .select('id, nome, cognome, cod_fiscale, cellulare, email, tipo, anno, pagamento, note')
      .eq('user_id', req.user.id)
      .in('cod_fiscale', cfList);

    if (error) throw error;

    const exMap = new Map((existing || []).map((x) => [x.cod_fiscale, x]));
    const conflicts = [];

    for (const r of normalized) {
      const cf = normCF(r.cod_fiscale);
      if (!cf) continue;
      const ex = exMap.get(cf);
      if (ex) conflicts.push({ incoming: r, existing: ex });
    }

    res.json({ validRows: normalized, conflicts, duplicatesInFile });
  } catch (e) {
    console.error('POST /tesserati/import/preview', e);
    res.status(500).json({ error: 'Errore preview import' });
  }
});

/**
 * IMPORT - COMMIT
 * POST /api/tesserati/import/commit
 * FIX: niente upsert/onConflict. Se CF presente:
 *  - update per (user_id + cod_fiscale)
 *  - se nessuna riga aggiornata -> insert
 */
router.post('/import/commit', async (req, res) => {
  try {
    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    if (!actions.length) return res.json({ inserted: 0, updated: 0, skipped: 0, errors: [] });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    const hasAny = (r) =>
      !!(
        r.nome ||
        r.cognome ||
        r.cod_fiscale ||
        r.cellulare ||
        r.email ||
        r.indirizzo ||
        r.citta ||
        r.tipo ||
        r.anno ||
        r.pagamento ||
        r.note
      );

    for (const a of actions) {
      const action = norm(a.action);
      const incoming = pickCore(a.incoming || {});
      const targetId = norm(a.targetId);

      if (action === 'skip') {
        skipped++;
        continue;
      }

      // scarto SOLO righe totalmente vuote
      if (!hasAny(incoming)) {
        skipped++;
        continue;
      }

      // normalizza CF se presente
      if (incoming.cod_fiscale) {
        incoming.cod_fiscale = String(incoming.cod_fiscale).trim().toUpperCase().replace(/\s+/g, '');
      }

      if (action === 'overwrite') {
        if (!targetId) {
          errors.push({ action, incoming, error: 'targetId mancante per overwrite' });
          continue;
        }

        const { error } = await supabase
          .from('tesserati')
          .update(incoming)
          .eq('id', targetId)
          .eq('user_id', req.user.id);

        if (error) {
          errors.push({ action, incoming, error: error.message });
          continue;
        }

        updated++;
        continue;
      }

      if (action === 'insert') {
        // CF presente -> update-first (user_id + cod_fiscale), altrimenti insert
        if (incoming.cod_fiscale) {
          const { data: updRows, error: updErr } = await supabase
            .from('tesserati')
            .update(incoming)
            .eq('user_id', req.user.id)
            .eq('cod_fiscale', incoming.cod_fiscale)
            .select('id');

          if (updErr) {
            errors.push({ action, incoming, error: updErr.message });
            continue;
          }

          if (Array.isArray(updRows) && updRows.length > 0) {
            updated++;
            continue;
          }

          const { error: insErr } = await supabase
            .from('tesserati')
            .insert([{ ...incoming, user_id: req.user.id }]);

          if (insErr) {
            errors.push({ action, incoming, error: insErr.message });
            continue;
          }

          inserted++;
          continue;
        }

        // CF vuoto -> insert normale
        const { error: insErr } = await supabase
          .from('tesserati')
          .insert([{ ...incoming, user_id: req.user.id }]);

        if (insErr) {
          errors.push({ action, incoming, error: insErr.message });
          continue;
        }

        inserted++;
        continue;
      }

      errors.push({ action, incoming, error: 'Azione non valida' });
    }

    res.json({ inserted, updated, skipped, errors });
  } catch (e) {
    console.error('POST /tesserati/import/commit', e);
    res.status(500).json({ error: 'Errore commit import' });
  }
});

module.exports = router;
