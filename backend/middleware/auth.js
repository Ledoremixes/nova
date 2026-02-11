const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Token mancante' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'user',
      is_admin: payload.role === 'admin',
      is_active: payload.is_active !== false
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

module.exports = { auth };
