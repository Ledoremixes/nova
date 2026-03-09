// backend/routes/teachers.js
const express = require("express");
const multer = require("multer");
const { supabaseAdmin } = require("../supabaseAdmin");
const { auth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();
router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

function extFromMime(mime) {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "jpg";
}

// GET /api/teachers
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("teachers")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ teachers: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/teachers  (admin)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { full_name, courses } = req.body || {};
    if (!full_name?.trim()) return res.status(400).json({ error: "Missing full_name" });

    const payload = {
      full_name: full_name.trim(),
      courses: Array.isArray(courses) ? courses : [],
    };

    const { data, error } = await supabaseAdmin
      .from("teachers")
      .insert([payload])
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ teacher: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/teachers/:id/update (admin) - aggiorna corsi (e in futuro altro)
router.post("/:id/update", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { courses, full_name } = req.body || {};

    const patch = {};
    if (typeof full_name === "string") patch.full_name = full_name.trim();
    if (Array.isArray(courses)) patch.courses = courses;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("teachers")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ teacher: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// GET /api/teachers/:id/documents
router.get("/:id/documents", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("teacher_documents")
      .select("*")
      .eq("teacher_id", id)
      .order("uploaded_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ documents: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/teachers/:id/photo (admin) - upload immagine
router.post("/:id/photo", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const ext = extFromMime(file.mimetype);
    const path = `photos/${id}/profile.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("teachers")
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    // salva solo photo_path (bucket private)
    const { error: dbErr } = await supabaseAdmin
      .from("teachers")
      .update({ photo_path: path, photo_url: null })
      .eq("id", id);

    if (dbErr) return res.status(500).json({ error: dbErr.message });

    return res.json({ ok: true, photo_path: path });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/teachers/:id/contract (admin) - upload contratto pdf
router.post("/:id/contract", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const path = `contracts/${id}/contratto.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("teachers")
      .upload(path, file.buffer, {
        contentType: file.mimetype || "application/pdf",
        upsert: true,
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    // upsert record in teacher_documents
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("teacher_documents")
      .select("id")
      .eq("teacher_id", id)
      .eq("type", "contract")
      .maybeSingle();

    if (exErr) return res.status(500).json({ error: exErr.message });

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("teacher_documents")
        .update({
          file_name: file.originalname,
          file_path: path,
          file_url: null,
          uploaded_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabaseAdmin.from("teacher_documents").insert([
        {
          teacher_id: id,
          type: "contract",
          month: null,
          file_name: file.originalname,
          file_path: path,
          file_url: null,
        },
      ]);
      if (error) return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, file_path: path });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/teachers/:id/payslip (admin) - upload distinta pdf + month
router.post("/:id/payslip", requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const month = req.body?.month;

    if (!file) return res.status(400).json({ error: "Missing file" });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Invalid month (YYYY-MM)" });
    }

    const path = `payslips/${id}/${month}-distinta.pdf`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("teachers")
      .upload(path, file.buffer, {
        contentType: file.mimetype || "application/pdf",
        upsert: true,
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    // se esiste già stessa month → update; altrimenti insert
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("teacher_documents")
      .select("id")
      .eq("teacher_id", id)
      .eq("type", "payslip")
      .eq("month", month)
      .maybeSingle();

    if (exErr) return res.status(500).json({ error: exErr.message });

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("teacher_documents")
        .update({
          file_name: file.originalname,
          file_path: path,
          file_url: null,
          uploaded_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabaseAdmin.from("teacher_documents").insert([
        {
          teacher_id: id,
          type: "payslip",
          month,
          file_name: file.originalname,
          file_path: path,
          file_url: null,
        },
      ]);
      if (error) return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true, file_path: path });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// DELETE /api/teachers/:id/documents/:docId (admin) - delete file + record
router.delete("/:id/documents/:docId", requireAdmin, async (req, res) => {
  try {
    const { id, docId } = req.params;

    const { data: doc, error: getErr } = await supabaseAdmin
      .from("teacher_documents")
      .select("*")
      .eq("id", docId)
      .eq("teacher_id", id)
      .single();

    if (getErr) return res.status(404).json({ error: "Document not found" });

    if (doc.file_path) {
      const { error: rmErr } = await supabaseAdmin.storage
        .from("teachers")
        .remove([doc.file_path]);
      if (rmErr) return res.status(500).json({ error: rmErr.message });
    }

    const { error: delErr } = await supabaseAdmin
      .from("teacher_documents")
      .delete()
      .eq("id", docId);

    if (delErr) return res.status(500).json({ error: delErr.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// DELETE /api/teachers/:id/photo (admin)
router.delete("/:id/photo", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // leggo il teacher per sapere il path
    const { data: t, error: getErr } = await supabaseAdmin
      .from("teachers")
      .select("photo_path")
      .eq("id", id)
      .single();

    if (getErr) return res.status(404).json({ error: "Teacher not found" });

    const path = t?.photo_path;
    if (path) {
      const { error: rmErr } = await supabaseAdmin.storage
        .from("teachers")
        .remove([path]);

      if (rmErr) return res.status(500).json({ error: rmErr.message });
    }

    const { error: upErr } = await supabaseAdmin
      .from("teachers")
      .update({ photo_path: null, photo_url: null })
      .eq("id", id);

    if (upErr) return res.status(500).json({ error: upErr.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
});

// POST /api/storage/signed-urls
router.post("/signed-urls", auth, async (req, res) => {
  try {
    const { paths } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.json({ urls: {} });
    }

    // dedup + pulizia
    const uniq = Array.from(new Set(paths.filter(Boolean)));

    const urls = {};

    // 60 min (puoi cambiare)
    const expiresIn = 60 * 60;

    for (const p of uniq) {
      const { data, error } = await supabaseAdmin
        .storage
        .from("teachers")
        .createSignedUrl(p, expiresIn);

      if (!error && data?.signedUrl) urls[p] = data.signedUrl;
    }

    return res.json({ urls });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Errore signed-urls" });
  }
});


module.exports = router;
