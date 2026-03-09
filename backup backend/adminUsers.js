const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

// ✅ Lista utenti (solo admin)
router.get('/users', auth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,role')
    .order('email', { ascending: true });

  if (error) return res.status(400).json({ error: 'Errore lettura utenti' });
  return res.json({ users: data || [] });
});

// ✅ Crea utente (solo admin)
router.post('/users', auth, requireAdmin, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password min 6 caratteri' });
    }

    const safeRole = role === 'admin' ? 'admin' : 'user';

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Email già esistente' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({ email, password_hash, role: safeRole })
      .select('id,email,role')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(400).json({ error: 'Creazione utente non riuscita' });
    }

    return res.status(201).json({ user: data });
  } catch (err) {
    console.error('Errore create user:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ✅ Elimina utente (solo admin) - blocco auto-eliminazione
router.delete('/users/:id', auth, requireAdmin, async (req, res) => {
  const id = req.params.id;

  if (id === req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare il tuo utente admin' });
  }

  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return res.status(400).json({ error: 'Errore eliminazione utente' });

  return res.json({ ok: true });
});

// ✅ Disattiva utente (solo admin) - blocco auto-disattivazione
const { writeAudit } = require('../utils/audit');

router.patch('/users/:id/disable', auth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Non puoi disattivare te stesso' });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', id)
    .select('id,email,role,is_active')
    .single();

  if (error) return res.status(400).json({ error: 'Errore disattivazione utente' });

  await writeAudit(req, { action: 'USER_DISABLE', targetUserId: id, meta: { email: data.email } });

  return res.json({ user: data });
});


// ✅ Riattiva utente (solo admin)
router.patch('/users/:id/enable', auth, requireAdmin, async (req, res) => {
  const id = req.params.id;

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: true })
    .eq('id', id)
    .select('id,email,role,is_active')
    .single();

  if (error) return res.status(400).json({ error: 'Errore riattivazione utente' });

  await writeAudit(req, { action: 'USER_ENABLE', targetUserId: id, meta: { email: data.email } });

  return res.json({ user: data });
});


// ✅ Reset password utente (solo admin)
const crypto = require('crypto');

function genTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 char safe
}

router.post('/users/:id/reset-password', auth, requireAdmin, async (req, res) => {
  const id = req.params.id;

  const newPassword = (req.body?.password && String(req.body.password)) || genTempPassword();
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password min 6 caratteri' });
  }

  const hash = await bcrypt.hash(newPassword, 10);

  const { data, error } = await supabase
    .from('users')
    .update({ password_hash: hash })
    .eq('id', id)
    .select('id,email,role,is_active')
    .single();

  if (error) return res.status(400).json({ error: 'Errore reset password' });

  await writeAudit(req, {
    action: 'USER_RESET_PASSWORD',
    targetUserId: id,
    meta: { email: data.email, generated: !req.body?.password }
  });

  // ⚠️ la password viene mostrata SOLO all’admin che la resetta
  return res.json({ user: data, tempPassword: req.body?.password ? null : newPassword });
});

// ✅ Leggi audit log (solo admin)
router.get('/audit', auth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,actor_user_id,action,target_user_id,meta,ip,user_agent,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(400).json({ error: 'Errore lettura audit log' });

  return res.json({ logs: data || [] });
});


module.exports = router;
