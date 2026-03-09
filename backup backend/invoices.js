const express = require('express');
const PDFDocument = require('pdfkit');

const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// =============================
// Helpers
// =============================
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toInt(x, fallback = null) {
  const n = parseInt(String(x), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toISODateOrNull(x) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function eur(v) {
  return num(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function safeText(v) {
  return String(v ?? '').trim();
}

function computeTotals(items = []) {
  const rows = Array.isArray(items) ? items : [];

  let subtotal = 0;
  let vat = 0;

  const normalized = rows
    .map((it) => {
      const qty = Math.max(0, num(it.qty ?? 1));
      const unit = num(it.unit_price ?? it.unitPrice ?? 0);
      const vatRate = Math.max(0, num(it.vat_rate ?? it.vatRate ?? 0));
      const lineSubtotal = qty * unit;
      const lineVat = lineSubtotal * (vatRate / 100);
      const lineTotal = lineSubtotal + lineVat;
      subtotal += lineSubtotal;
      vat += lineVat;
      return {
        description: safeText(it.description || ''),
        qty,
        unit_price: Number(unit.toFixed(2)),
        vat_rate: Number(vatRate.toFixed(2)),
        line_subtotal: Number(lineSubtotal.toFixed(2)),
        line_vat: Number(lineVat.toFixed(2)),
        line_total: Number(lineTotal.toFixed(2)),
      };
    })
    .filter((it) => it.description || it.qty > 0 || it.unit_price > 0);

  subtotal = Number(subtotal.toFixed(2));
  vat = Number(vat.toFixed(2));
  const total = Number((subtotal + vat).toFixed(2));

  return { items: normalized, subtotal, vat, total };
}

async function getNextNumberForYear({ userId, year }) {
  const { data, error } = await supabase
    .from('invoices')
    .select('number')
    .eq('user_id', userId)
    .eq('year', year)
    .order('number', { ascending: false })
    .limit(1);

  if (error) {
    const e = new Error(error.message || 'Errore calcolo progressivo fattura');
    e.details = error;
    throw e;
  }

  const last = data?.[0]?.number;
  return (toInt(last, 0) || 0) + 1;
}

async function insertInvoiceWithRetry(payload, { maxRetry = 6 } = {}) {
  // protezione da race: UNIQUE(user_id, year, number) + retry
  for (let attempt = 0; attempt < maxRetry; attempt++) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(payload)
      .select('*')
      .single();

    if (!error) return data;

    const msg = String(error.message || '');

    // in caso di violazione univocità, ricalcola number e riprova
    if (/duplicate key|unique constraint|violates unique/i.test(msg)) {
      payload.number = await getNextNumberForYear({ userId: payload.user_id, year: payload.year });
      continue;
    }

    const e = new Error(error.message || 'Errore inserimento fattura');
    e.details = error;
    throw e;
  }

  throw new Error('Impossibile creare la fattura: troppi tentativi (conflitto numerazione).');
}

// =============================
// GET /api/invoices?year=2026
// =============================
router.get('/', async (req, res) => {
  try {
    const year = toInt(req.query.year, null);

    let q = supabase
      .from('invoices')
      .select('*')
      .eq('user_id', req.user.id)
      .order('issue_date', { ascending: false })
      .order('number', { ascending: false });

    if (year) q = q.eq('year', year);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ ok: true, data: data || [] });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore caricamento fatture' });
  }
});

// =============================
// GET /api/invoices/next-number?year=2026
// =============================
router.get('/next-number', async (req, res) => {
  try {
    const year = toInt(req.query.year, new Date().getFullYear());
    const nextNumber = await getNextNumberForYear({ userId: req.user.id, year });
    res.json({ ok: true, data: { year, nextNumber } });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore calcolo progressivo' });
  }
});

// =============================
// POST /api/invoices
// body: { year, number?, issue_date, due_date?, seller{}, customer{}, items[], notes? }
// =============================
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};

    const year = toInt(body.year, new Date().getFullYear());
    const issue_date = toISODateOrNull(body.issue_date) || new Date().toISOString().slice(0, 10);
    const due_date = toISODateOrNull(body.due_date);

    const seller = body.seller && typeof body.seller === 'object' ? body.seller : {};
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};

    const computed = computeTotals(body.items || []);

    let number = toInt(body.number, null);
    if (!number) number = await getNextNumberForYear({ userId: req.user.id, year });

    const row = {
      user_id: req.user.id,
      year,
      number,
      issue_date,
      due_date,
      seller,
      customer,
      items: computed.items,
      notes: safeText(body.notes || ''),
      subtotal: computed.subtotal,
      vat: computed.vat,
      total: computed.total,
      currency: 'EUR',
    };

    const inserted = await insertInvoiceWithRetry(row);

    res.status(201).json({ ok: true, data: inserted });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore creazione fattura' });
  }
});

// =============================
// DELETE /api/invoices/:id
// =============================
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore eliminazione fattura' });
  }
});

// =============================
// GET /api/invoices/:id/pdf
// =============================
router.get('/:id/pdf', async (req, res) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Fattura non trovata' });

    const inv = data;

    const filename = `Fattura_${inv.year}_${String(inv.number).padStart(4, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    doc.pipe(res);

    // --------
    // Theme
    // --------
    const pageW = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageW - doc.page.margins.right;
    const contentW = right - left;

    const brand = '#111827';
    const soft = '#F3F4F6';

    const seller = inv.seller || {};
    const customer = inv.customer || {};
    const items = Array.isArray(inv.items) ? inv.items : [];

    // --------
    // Header
    // --------
    doc.save();
    doc.rect(0, 0, pageW, 120).fill(brand);
    doc.restore();

    doc.fillColor('#fff');
    doc.font('Helvetica-Bold').fontSize(20).text('FATTURA', left, 32);

    const invNo = `${inv.year}/${String(inv.number).padStart(4, '0')}`;
    doc.fontSize(11).font('Helvetica').text(`N. ${invNo}`, left, 60);
    doc.text(`Data: ${inv.issue_date || ''}`, left, 78);
    if (inv.due_date) doc.text(`Scadenza: ${inv.due_date}`, left, 94);

    // Seller box (right)
    const sellerX = left + contentW * 0.52;
    const sellerW = right - sellerX;
    doc.save();
    doc.roundedRect(sellerX, 28, sellerW, 82, 10).fill('#0B1220');
    doc.restore();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text('Cedente / Prestatore', sellerX + 12, 38);
    doc.font('Helvetica').fontSize(9).fillColor('#D1D5DB');

    const sellerLines = [
      safeText(seller.name),
      safeText(seller.address),
      safeText(seller.city),
      seller.vat ? `P.IVA: ${safeText(seller.vat)}` : '',
      seller.cf ? `CF: ${safeText(seller.cf)}` : '',
      seller.iban ? `IBAN: ${safeText(seller.iban)}` : '',
    ].filter(Boolean);
    doc.text(sellerLines.join('\n') || '—', sellerX + 12, 54, { width: sellerW - 24 });

    // --------
    // Customer box
    // --------
    doc.moveDown();
    doc.y = 140;
    const boxY = doc.y;

    doc.save();
    doc.roundedRect(left, boxY, contentW, 96, 12).fill(soft).stroke('#E5E7EB');
    doc.restore();

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('Cessionario / Committente', left + 14, boxY + 12);
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
    const custLines = [
      safeText(customer.name),
      safeText(customer.address),
      safeText(customer.city),
      customer.vat ? `P.IVA: ${safeText(customer.vat)}` : '',
      customer.cf ? `CF: ${safeText(customer.cf)}` : '',
      customer.sdi ? `Codice SDI: ${safeText(customer.sdi)}` : '',
      customer.pec ? `PEC: ${safeText(customer.pec)}` : '',
      customer.email ? `Email: ${safeText(customer.email)}` : '',
    ].filter(Boolean);
    doc.text(custLines.join('\n') || '—', left + 14, boxY + 30, { width: contentW - 28 });

    // --------
    // Items table
    // --------
    doc.y = boxY + 118;

    const cols = {
      desc: { x: left, w: contentW * 0.46 },
      qty: { x: left + contentW * 0.46, w: contentW * 0.09 },
      unit: { x: left + contentW * 0.55, w: contentW * 0.15 },
      vat: { x: left + contentW * 0.70, w: contentW * 0.10 },
      total: { x: left + contentW * 0.80, w: contentW * 0.20 },
    };

    const headerH = 24;
    const rowH = 22;
    const tableTop = doc.y;

    const drawHeader = () => {
      doc.save();
      doc.rect(left, doc.y, contentW, headerH).fill('#111827');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
      doc.text('Descrizione', cols.desc.x + 8, doc.y + 7, { width: cols.desc.w - 16 });
      doc.text('Q.tà', cols.qty.x, doc.y + 7, { width: cols.qty.w, align: 'right' });
      doc.text('Prezzo', cols.unit.x, doc.y + 7, { width: cols.unit.w, align: 'right' });
      doc.text('IVA', cols.vat.x, doc.y + 7, { width: cols.vat.w, align: 'right' });
      doc.text('Totale', cols.total.x, doc.y + 7, { width: cols.total.w - 8, align: 'right' });
      doc.restore();
      doc.y += headerH;
    };

    const bottomY = () => doc.page.height - doc.page.margins.bottom;
    const ensureSpace = (need) => {
      if (doc.y + need > bottomY()) {
        doc.addPage();
        drawHeader();
      }
    };

    drawHeader();

    doc.font('Helvetica').fontSize(9).fillColor('#111827');

    items.forEach((it, idx) => {
      ensureSpace(rowH + 6);
      if (idx % 2 === 0) {
        doc.save();
        doc.rect(left, doc.y, contentW, rowH).fill('#F9FAFB');
        doc.restore();
      }

      const desc = safeText(it.description);
      const qty = num(it.qty ?? 0);
      const unit = num(it.unit_price ?? 0);
      const vatRate = num(it.vat_rate ?? 0);
      const lineTotal = num(it.line_total ?? (qty * unit * (1 + vatRate / 100)));

      doc.fillColor('#111827').text(desc, cols.desc.x + 8, doc.y + 6, { width: cols.desc.w - 16 });
      doc.text(String(qty).replace('.', ','), cols.qty.x, doc.y + 6, { width: cols.qty.w, align: 'right' });
      doc.text(eur(unit), cols.unit.x, doc.y + 6, { width: cols.unit.w, align: 'right' });
      doc.text(`${vatRate.toFixed(0)}%`, cols.vat.x, doc.y + 6, { width: cols.vat.w, align: 'right' });
      doc.text(eur(lineTotal), cols.total.x, doc.y + 6, { width: cols.total.w - 8, align: 'right' });

      doc.y += rowH;
    });

    // table border
    doc.save();
    doc.rect(left, tableTop, contentW, doc.y - tableTop).stroke('#E5E7EB');
    doc.restore();

    // --------
    // Totals
    // --------
    ensureSpace(120);

    const totalsW = contentW * 0.42;
    const totalsX = right - totalsW;
    const totalsY = doc.y + 16;

    doc.save();
    doc.roundedRect(totalsX, totalsY, totalsW, 92, 12).fill('#0B1220');
    doc.restore();

    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text('Totali', totalsX + 14, totalsY + 12);
    doc.font('Helvetica').fontSize(10);

    const row = (label, value, y) => {
      doc.fillColor('#9CA3AF').text(label, totalsX + 14, y);
      doc.fillColor('#fff').text(value, totalsX + 14, y, { width: totalsW - 28, align: 'right' });
    };

    row('Imponibile', eur(inv.subtotal), totalsY + 34);
    row('IVA', eur(inv.vat), totalsY + 52);
    doc.save();
    doc.moveTo(totalsX + 14, totalsY + 72).lineTo(totalsX + totalsW - 14, totalsY + 72).stroke('#374151');
    doc.restore();
    doc.fillColor('#fff').font('Helvetica-Bold');
    row('Totale', eur(inv.total), totalsY + 78);

    // Notes
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10);
    doc.text('Note', left, totalsY);
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
    doc.text(inv.notes || '—', left, totalsY + 18, { width: contentW * 0.54 });

    // Footer
    doc.fillColor('#6B7280').fontSize(8);
    doc.text('Documento generato dal Gestionale ASD', left, doc.page.height - doc.page.margins.bottom + 10, {
      width: contentW,
      align: 'center',
    });

    doc.end();
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore generazione PDF fattura' });
  }
});

module.exports = router;
