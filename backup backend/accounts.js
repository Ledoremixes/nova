const express = require('express');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// GET /api/accounts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('code', { ascending: true });

    if (error) {
      console.error('Errore get accounts:', error);
      return res.status(500).json({ error: 'Errore lettura conti' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Errore get accounts:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// POST /api/accounts
router.post('/', async (req, res) => {
  try {
    const { code, name, type } = req.body;

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: req.user.id,
        code,
        name,
        type
      })
      .select()
      .single();

    if (error) {
      console.error('Errore create account:', error);
      return res.status(500).json({ error: 'Errore creazione conto' });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Errore create account:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// PATCH /api/accounts/:id  (modifica conto)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, type } = req.body;

    const update = {};
    if (code !== undefined) update.code = code;
    if (name !== undefined) update.name = name;
    if (type !== undefined) update.type = type;

    const { data, error } = await supabase
      .from('accounts')
      .update(update)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Errore update account:', error);
      return res.status(500).json({ error: 'Errore aggiornamento conto' });
    }

    res.json(data);
  } catch (err) {
    console.error('Errore update account:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Errore delete account:', error);
      return res.status(500).json({ error: 'Errore eliminazione conto' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Errore delete account:', err);
    res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
