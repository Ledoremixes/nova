const express = require('express');
const fs = require('fs');
const path = require('path');
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

async function getNextNumberForYear({ year }) {
  const { data, error } = await supabase
    .from('invoices')
    .select('number')
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
  for (let attempt = 0; attempt < maxRetry; attempt++) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(payload)
      .select('*')
      .single();

    if (!error) return data;

    const msg = String(error.message || '');
    if (/duplicate key|unique constraint|violates unique/i.test(msg)) {
      payload.number = await getNextNumberForYear({ year: payload.year });
      continue;
    }

    const e = new Error(error.message || 'Errore inserimento fattura');
    e.details = error;
    throw e;
  }

  throw new Error('Impossibile creare la fattura: troppi tentativi (conflitto numerazione).');
}

function resolveInvoiceLogo(seller = {}) {
  const raw = [seller.logo_data_url, seller.logo, seller.logo_path]
    .find((v) => typeof v === 'string' && v.trim());

  if (raw && raw.startsWith('data:image/')) {
    try {
      const b64 = raw.split(',')[1] || '';
      return Buffer.from(b64, 'base64');
    } catch (_) {
      return null;
    }
  }

  const candidates = [];
  if (raw) {
    candidates.push(raw);
    candidates.push(path.resolve(process.cwd(), raw));
    candidates.push(path.resolve(__dirname, '..', raw));
    candidates.push(path.resolve(__dirname, '..', '..', raw));
  }

  candidates.push(
    path.resolve(process.cwd(), 'frontend/public/logo.png'),
    path.resolve(process.cwd(), 'public/logo.png'),
    path.resolve(__dirname, '../../frontend/public/logo.png'),
    path.resolve(__dirname, '../frontend/public/logo.png')
  );

  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) return file;
    } catch (_) {
      // ignore
    }
  }

  return null;
}

function drawLogo(doc, seller, x, y, w, h) {
  const logo = resolveInvoiceLogo(seller);
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [w, h], align: 'left', valign: 'center' });
      return;
    } catch (_) {
      // fallback below
    }
  }

  doc.save();
  doc.roundedRect(x, y, w, h, 10).fill('#F3E8FF');
  doc.restore();
  doc.fillColor('#6D28D9').font('Helvetica-Bold').fontSize(16).text('N', x, y + 10, { width: w, align: 'center' });
  doc.fillColor('#7C3AED').font('Helvetica').fontSize(7).text('NOVA', x, y + 30, { width: w, align: 'center' });
}

function drawCard(doc, x, y, w, h, options = {}) {
  const fill = options.fill || '#FFFFFF';
  const stroke = options.stroke || '#E5E7EB';
  const radius = options.radius || 14;
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fillAndStroke(fill, stroke);
  doc.restore();
}

function buildPartyLines(data = {}, isSeller = false) {
  return [
    safeText(data.name),
    safeText(data.address),
    safeText(data.city),
    data.vat ? `P.IVA: ${safeText(data.vat)}` : '',
    data.cf ? `CF: ${safeText(data.cf)}` : '',
    data.sdi ? `Codice SDI: ${safeText(data.sdi)}` : '',
    data.pec ? `PEC: ${safeText(data.pec)}` : '',
    data.email ? `Email: ${safeText(data.email)}` : '',
    isSeller && data.iban ? `IBAN: ${safeText(data.iban)}` : '',
  ].filter(Boolean);
}

function calcTextHeight(doc, text, width, font = 'Helvetica', size = 9, lineGap = 2) {
  const prevFont = doc._font;
  const prevSize = doc._fontSize;
  doc.font(font).fontSize(size);
  const h = doc.heightOfString(text || '-', { width, lineGap });
  if (prevFont) doc.font(prevFont);
  if (prevSize) doc.fontSize(prevSize);
  return h;
}

function drawInvoicePdf(doc, inv) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const contentW = right - left;
  const bottomLimit = () => pageH - doc.page.margins.bottom - 22;

  const brand = '#0F172A';
  const brand2 = '#111827';
  const accent = '#7C3AED';
  const border = '#E5E7EB';
  const soft = '#F8FAFC';
  const text = '#111827';
  const muted = '#6B7280';

  const seller = inv.seller || {};
  const customer = inv.customer || {};
  const items = Array.isArray(inv.items) ? inv.items : [];
  const invNo = `${inv.year}/${String(inv.number).padStart(4, '0')}`;

  let y = 0;

  function drawHeader() {
    doc.save();
    doc.rect(0, 0, pageW, 122).fill(brand);
    doc.restore();

    drawLogo(doc, seller, left, 28, 64, 64);

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('FATTURA', left + 82, 30);
    doc.font('Helvetica').fontSize(10).fillColor('#D1D5DB');
    doc.text(`Numero: ${invNo}`, left + 82, 58);
    doc.text(`Data: ${inv.issue_date || ''}`, left + 82, 74);
    doc.text(`Scadenza: ${inv.due_date || '-'}`, left + 82, 90);

    const badgeW = 156;
    const badgeX = right - badgeW;
    drawCard(doc, badgeX, 26, badgeW, 72, { fill: '#0B1220', stroke: '#334155', radius: 14 });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text('Totale documento', badgeX + 14, 40);
    doc.font('Helvetica-Bold').fontSize(18).text(eur(inv.total || 0), badgeX + 14, 56, { width: badgeW - 28, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#CBD5E1').text(inv.currency || 'EUR', badgeX + 14, 78, { width: badgeW - 28, align: 'right' });

    y = 144;
  }

  function drawPartySection() {
    const gap = 14;
    const sellerW = contentW * 0.48;
    const customerW = contentW - sellerW - gap;
    const sellerLines = buildPartyLines(seller, true).join('\n') || '-';
    const customerLines = buildPartyLines(customer, false).join('\n') || '-';

    const titleH = 18;
    const sellerBodyH = calcTextHeight(doc, sellerLines, sellerW - 28, 'Helvetica', 9, 2);
    const customerBodyH = calcTextHeight(doc, customerLines, customerW - 28, 'Helvetica', 9, 2);
    const cardH = Math.max(112, Math.max(sellerBodyH, customerBodyH) + titleH + 36);

    drawCard(doc, left, y, sellerW, cardH, { fill: '#FFFFFF', stroke: border, radius: 14 });
    drawCard(doc, left + sellerW + gap, y, customerW, cardH, { fill: soft, stroke: border, radius: 14 });

    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10).text('Cedente / Prestatore', left + 14, y + 16);
    doc.fillColor(text).font('Helvetica').fontSize(9).text(sellerLines, left + 14, y + 36, {
      width: sellerW - 28,
      lineGap: 2,
    });

    const cx = left + sellerW + gap;
    doc.fillColor(brand2).font('Helvetica-Bold').fontSize(10).text('Cessionario / Committente', cx + 14, y + 16);
    doc.fillColor(text).font('Helvetica').fontSize(9).text(customerLines, cx + 14, y + 36, {
      width: customerW - 28,
      lineGap: 2,
    });

    y += cardH + 20;
  }

  const cols = {
    desc: { x: left, w: contentW * 0.45 },
    qty: { x: left + contentW * 0.45, w: contentW * 0.08 },
    unit: { x: left + contentW * 0.53, w: contentW * 0.15 },
    vat: { x: left + contentW * 0.68, w: contentW * 0.10 },
    total: { x: left + contentW * 0.78, w: contentW * 0.22 },
  };
  const tableHeaderH = 30;
  const cellPadX = 10;
  const cellPadY = 9;

  function drawTableHeader() {
    drawCard(doc, left, y, contentW, tableHeaderH, { fill: brand2, stroke: brand2, radius: 10 });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('Descrizione', cols.desc.x + cellPadX, y + 10, { width: cols.desc.w - 2 * cellPadX });
    doc.text('Q.tà', cols.qty.x + 2, y + 10, { width: cols.qty.w - 8, align: 'right' });
    doc.text('Prezzo', cols.unit.x + 2, y + 10, { width: cols.unit.w - 8, align: 'right' });
    doc.text('IVA', cols.vat.x + 2, y + 10, { width: cols.vat.w - 8, align: 'right' });
    doc.text('Totale', cols.total.x + 2, y + 10, { width: cols.total.w - 8, align: 'right' });
    y += tableHeaderH + 6;
  }

  function ensureSpace(heightNeeded) {
    if (y + heightNeeded <= bottomLimit()) return;
    doc.addPage();
    drawHeader();
    drawTableHeader();
  }

  function drawItems() {
    drawTableHeader();

    if (!items.length) {
      ensureSpace(50);
      drawCard(doc, left, y, contentW, 44, { fill: '#FFFFFF', stroke: border, radius: 10 });
      doc.fillColor(muted).font('Helvetica').fontSize(9).text('Nessuna voce presente.', left + 14, y + 15);
      y += 54;
      return;
    }

    items.forEach((it, idx) => {
      const desc = safeText(it.description) || '-';
      const qty = num(it.qty ?? 0);
      const unit = num(it.unit_price ?? 0);
      const vatRate = num(it.vat_rate ?? 0);
      const lineTotal = num(it.line_total ?? (qty * unit * (1 + vatRate / 100)));

      const descH = calcTextHeight(doc, desc, cols.desc.w - 2 * cellPadX, 'Helvetica', 9, 2);
      const rowH = Math.max(38, descH + cellPadY * 2);
      ensureSpace(rowH + 8);

      drawCard(doc, left, y, contentW, rowH, {
        fill: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
        stroke: border,
        radius: 10,
      });

      doc.save();
      [cols.qty.x, cols.unit.x, cols.vat.x, cols.total.x].forEach((x) => {
        doc.moveTo(x, y).lineTo(x, y + rowH).stroke(border);
      });
      doc.restore();

      const baseY = y + cellPadY;
      const numberY = y + (rowH - 10) / 2 - 1;

      doc.fillColor(text).font('Helvetica').fontSize(9).text(desc, cols.desc.x + cellPadX, baseY, {
        width: cols.desc.w - 2 * cellPadX,
        lineGap: 2,
      });
      doc.text(String(qty).replace('.', ','), cols.qty.x + 2, numberY, { width: cols.qty.w - 8, align: 'right' });
      doc.text(eur(unit), cols.unit.x + 2, numberY, { width: cols.unit.w - 8, align: 'right' });
      doc.text(`${vatRate.toFixed(0)}%`, cols.vat.x + 2, numberY, { width: cols.vat.w - 8, align: 'right' });
      doc.font('Helvetica-Bold').text(eur(lineTotal), cols.total.x + 2, numberY, { width: cols.total.w - 8, align: 'right' });

      y += rowH + 8;
    });
  }

  function drawBottomSection() {
    const notesText = safeText(inv.notes) || '-';
    const gap = 14;
    const notesW = contentW * 0.54;
    const totalsW = contentW - notesW - gap;
    const notesH = Math.max(96, calcTextHeight(doc, notesText, notesW - 28, 'Helvetica', 9, 2) + 38);
    const totalsH = 112;
    const sectionH = Math.max(notesH, totalsH);

    ensureSpace(sectionH + 26);

    drawCard(doc, left, y, notesW, sectionH, { fill: '#FFFFFF', stroke: border, radius: 14 });
    drawCard(doc, left + notesW + gap, y, totalsW, sectionH, { fill: '#0B1220', stroke: '#334155', radius: 14 });

    doc.fillColor(accent).font('Helvetica-Bold').fontSize(10).text('Note', left + 14, y + 16);
    doc.fillColor(text).font('Helvetica').fontSize(9).text(notesText, left + 14, y + 36, {
      width: notesW - 28,
      lineGap: 2,
    });

    const tx = left + notesW + gap;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('Riepilogo importi', tx + 14, y + 16);

    const rows = [
      ['Imponibile', eur(inv.subtotal || 0)],
      ['IVA', eur(inv.vat || 0)],
      ['Totale', eur(inv.total || 0)],
    ];

    let ty = y + 42;
    rows.forEach(([label, value], index) => {
      if (index === 2) {
        doc.save();
        doc.moveTo(tx + 14, ty - 10).lineTo(tx + totalsW - 14, ty - 10).stroke('#334155');
        doc.restore();
      }
      doc.fillColor(index === 2 ? '#FFFFFF' : '#CBD5E1')
        .font(index === 2 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(index === 2 ? 11 : 10)
        .text(label, tx + 14, ty);
      doc.text(value, tx + 14, ty, { width: totalsW - 28, align: 'right' });
      ty += 26;
    });

    y += sectionH + 22;
  }

  function drawFooter() {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(
      'Documento generato dal Gestionale Nova',
      left,
      pageH - doc.page.margins.bottom + 8,
      { width: contentW, align: 'center' }
    );
  }

  drawHeader();
  drawPartySection();
  drawItems();
  drawBottomSection();
  drawFooter();
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
    const nextNumber = await getNextNumberForYear({ year });
    res.json({ ok: true, data: { year, nextNumber } });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore calcolo progressivo' });
  }
});

// =============================
// POST /api/invoices
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
    if (!number) number = await getNextNumberForYear({ year });

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
// PATCH /api/invoices/:id
// =============================
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};

    const year = toInt(body.year, new Date().getFullYear());
    const issue_date = toISODateOrNull(body.issue_date) || new Date().toISOString().slice(0, 10);
    const due_date = toISODateOrNull(body.due_date);

    const seller = body.seller && typeof body.seller === 'object' ? body.seller : {};
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const computed = computeTotals(body.items || []);

    const patch = {
      year,
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

    const number = toInt(body.number, null);
    if (number) patch.number = number;

    const { data, error } = await supabase
      .from('invoices')
      .update(patch)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore modifica fattura' });
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
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Fattura non trovata' });

    const inv = data;
    const filename = `Fattura_${inv.year}_${String(inv.number).padStart(4, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    doc.pipe(res);
    drawInvoicePdf(doc, inv);
    doc.end();
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Errore generazione PDF fattura' });
  }
});

module.exports = router;
