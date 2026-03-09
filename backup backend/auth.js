const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth'); // ✅ FIX: mancava
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET non impostato in .env');
}

// ❌ Registrazione pubblica disabilitata
router.post('/register', async (req, res) => {
  return res
    .status(403)
    .json({ error: 'Registrazione disabilitata. Contatta l’amministratore.' });
});

// ✅ Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richieste' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id,email,password_hash,role,is_active')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    if (user.is_active === false) {
      return res
        .status(403)
        .json({ error: 'Utente disattivato. Contatta l’amministratore.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const role = user.role || 'user';
    const is_admin = String(role).toLowerCase() === 'admin';

    const token = jwt.sign(
      { sub: user.id, email: user.email, role, is_admin },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      user: { id: user.id, email: user.email, role, is_admin }
    });
  } catch (err) {
    console.error('Errore login:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

// ✅ Chi sono? (serve al frontend per capire admin/non-admin)
router.get('/me', auth, async (req, res) => {
  try {
    // 1) se il middleware ha già popolato ruolo
    let role = req.user?.role;

    // 2) fallback: leggi da tabella users (schema che già usi nel login)
    if (!role) {
      const { data: u, error } = await supabase
        .from('users')
        .select('id,email,role,is_active')
        .eq('id', req.user.id)
        .single();

      if (error || !u) return res.status(404).json({ error: 'Utente non trovato' });
      if (u.is_active === false)
        return res.status(403).json({ error: 'Utente disattivato' });

      role = u.role || 'user';
      return res.json({
        id: u.id,
        email: u.email,
        role,
        is_admin: String(role).toLowerCase() === 'admin'
      });
    }

    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: role || 'user',
      is_admin: !!req.user?.is_admin || String(role).toLowerCase() === 'admin'
    });
  } catch (err) {
    console.error('Errore /auth/me:', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
