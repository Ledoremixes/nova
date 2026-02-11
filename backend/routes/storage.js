// backend/routes/storage.js
const express = require("express");
const { supabaseAdmin } = require("../supabaseAdmin");
const { auth } = require("../middleware/auth");

const router = express.Router();
router.use(auth);

/**
 * POST /api/storage/signed-url
 * body: { path: string, expiresIn?: number }
 */
router.post("/signed-url", async (req, res) => {
  try {
    const { path, expiresIn } = req.body || {};
    if (!path) return res.status(400).json({ error: "Missing path" });

    const exp = Number(expiresIn || 60 * 10); // 10 min default
    const { data, error } = await supabaseAdmin.storage
      .from("teachers")
      .createSignedUrl(path, exp);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ signedUrl: data.signedUrl });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

module.exports = router;
