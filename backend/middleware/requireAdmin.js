function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Non autenticato" });
  if (req.user.is_active === false) return res.status(403).json({ error: "Utente disattivato" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Solo admin" });
  next();
}

module.exports = { requireAdmin };
