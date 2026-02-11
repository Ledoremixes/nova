const express = require('express');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();

// tutte le route qui richiedono login
router.use(auth);

// GET /api/entries?search=...&from=...&to=...&withoutAccount=true&accountCode=AS&page=1&pageSize=100
router.get('/', async (req, res) => {
  try {
    const {
      search,
      from,
      to,
      withoutAccount,
      accountCode,
      vatRate,
      page = '1',
      pageSize = '100'
    } = req.query;

    const vatRateNum =
      vatRate !== undefined && vatRate !== ''
        ? Number(vatRate)
        : null;


    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.max(1, Math.min(500, parseInt(pageSize, 10) || 100));
    const fromIdx = (pageNum - 1) * sizeNum;
    const toIdx = fromIdx + sizeNum - 1;

    let query = supabase
      .from('entries')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id);

    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    if (from) {
      query = query.gte('operation_datetime', from);
    }

    if (to) {
      query = query.lte('operation_datetime', to);
    }

    if (withoutAccount === 'true') {
      query = query.or('account_code.is.null,account_code.eq.""');
    } else if (accountCode) {
      // filtro per specifico conto (AS, B, C, F, I, SCU, ...)
      query = query.eq('account_code', accountCode);
    }

    // filtro per percentuale IVA
    if (vatRateNum !== null && !Number.isNaN(vatRateNum)) {
      query = query.eq('vat_rate', vatRateNum);
    }

    query = query
      .order('operation_datetime', { ascending: false })
      .range(fromIdx, toIdx);


    const { data, error, count } = await query;

    if (error) {
      console.error('Errore get entries:', error);
      return res.status(500).json({ error: 'Errore lettura movimenti' });
    }

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / sizeNum));

    res.json({
      items: data || [],
      total,
      page: pageNum,
      pageSize: sizeNum,
      totalPages
    });
  } catch (err) {
    console.error('Errore get entries:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/entries
router.post('/', async (req, res) => {
  try {
    const payload = req.body;

    const usedDate = payload.date || null;

    let opDatetime =
      payload.datetime ||
      payload.operation_datetime ||
      null;

    if (!opDatetime && usedDate) {
      opDatetime = `${usedDate}T00:00:00`;
    }

    const entry = {
      user_id: req.user.id,
      date: usedDate,
      operation_datetime: opDatetime,
      description: payload.description,
      amount_in: Number(payload.amountIn || 0),
      amount_out: Number(payload.amountOut || 0),
      account_code: payload.accountCode || null,
      method: payload.method || null,
      center: payload.center || null,
      note: payload.note || null,
      nature: payload.nature || null,
      vat_rate:
        payload.vatRate !== undefined && payload.vatRate !== null
          ? Number(payload.vatRate)
          : null,
      vat_amount:
        payload.vatAmount !== undefined && payload.vatAmount !== null
          ? Number(payload.vatAmount)
          : null,
      source: 'Manuale'
    };

    const { data, error } = await supabase
      .from('entries')
      .insert(entry)
      .select()
      .single();

    if (error) {
      console.error('Errore insert entry:', error);
      return res.status(500).json({ error: 'Errore salvataggio movimento' });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Errore post entry:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /api/entries/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Errore delete entry:', error);
      return res.status(500).json({ error: 'Errore eliminazione movimento' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Errore delete entry:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// PATCH /entries/:id/meta
router.patch('/:id/meta', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('PATCH /entries/:id/meta body =', req.body);

    const body = req.body || {};

    const accountCode =
      body.accountCode !== undefined
        ? body.accountCode
        : body.account_code !== undefined
        ? body.account_code
        : undefined;

    const nature =
      body.nature !== undefined
        ? body.nature
        : body.meta && body.meta.nature !== undefined
        ? body.meta.nature
        : undefined;

    // ✅ AGGIUNGI QUESTO
    const description =
      body.description !== undefined
        ? body.description
        : body.meta && body.meta.description !== undefined
        ? body.meta.description
        : undefined;

    const updates = {};

    if (accountCode !== undefined) updates.account_code = accountCode || null;
    if (nature !== undefined) updates.nature = nature || null;

    // ✅ AGGIUNGI QUESTO
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      console.warn('PATCH /entries/:id/meta chiamata senza campi aggiornabili. Body:', body);
      return res.status(400).json({
        error: 'Body non contiene campi aggiornabili (accountCode/account_code, nature, description)'
      });
    }

    const { data, error } = await supabase
      .from('entries')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('*');

    if (error) {
      console.error('Errore update meta:', error);
      return res.status(500).json({ error: 'Errore update meta' });
    }

    if (!data || data.length === 0) {
      console.warn('PATCH /entries/:id/meta nessuna riga trovata per id:', id);
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    return res.json(data[0]);
  } catch (err) {
    console.error('Errore update meta (catch):', err);
    return res.status(500).json({ error: 'Errore update meta' });
  }
});



module.exports = router;
