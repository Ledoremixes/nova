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

function pickVatMode(it) {
  const mode = String(it?.vat_mode ?? it?.vatMode ?? it?.price_mode ?? '').trim().toLowerCase();
  return mode === 'included' ? 'included' : 'excluded';
}

function computeLine(it = {}) {
  const qty = Math.max(0, num(it.qty ?? 1));
  const inputUnit = num(it.unit_price ?? it.unitPrice ?? 0);
  const vatRate = Math.max(0, num(it.vat_rate ?? it.vatRate ?? 0));
  const vatMode = pickVatMode(it);

  let lineSubtotal = 0;
  let lineVat = 0;
  let lineTotal = 0;
  let unitExVat = 0;
  let unitIncVat = 0;

  if (vatMode === 'included') {
    unitIncVat = inputUnit;
    unitExVat = vatRate > 0 ? inputUnit / (1 + vatRate / 100) : inputUnit;
    lineTotal = qty * unitIncVat;
    lineSubtotal = qty * unitExVat;
    lineVat = lineTotal - lineSubtotal;
  } else {
    unitExVat = inputUnit;
    unitIncVat = vatRate > 0 ? inputUnit * (1 + vatRate / 100) : inputUnit;
    lineSubtotal = qty * unitExVat;
    lineVat = lineSubtotal * (vatRate / 100);
    lineTotal = lineSubtotal + lineVat;
  }

  return {
    description: safeText(it.description || ''),
    qty: Number(qty.toFixed(2)),
    unit_price: Number(inputUnit.toFixed(2)),
    vat_rate: Number(vatRate.toFixed(2)),
    vat_mode: vatMode,
    unit_ex_vat: Number(unitExVat.toFixed(2)),
    unit_inc_vat: Number(unitIncVat.toFixed(2)),
    line_subtotal: Number(lineSubtotal.toFixed(2)),
    line_vat: Number(lineVat.toFixed(2)),
    line_total: Number(lineTotal.toFixed(2)),
  };
}

function computeTotals(items = []) {
  const rows = Array.isArray(items) ? items : [];
  let subtotal = 0;
  let vat = 0;
  let total = 0;

  const normalized = rows
    .map((it) => computeLine(it))
    .filter((it) => it.description || it.qty > 0 || it.unit_price > 0);

  for (const it of normalized) {
    subtotal += it.line_subtotal;
    vat += it.line_vat;
    total += it.line_total;
  }

  return {
    items: normalized,
    subtotal: Number(subtotal.toFixed(2)),
    vat: Number(vat.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
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

function drawLogoOrBadge(doc, seller, x, y, w, h) {
  const logoCandidate = seller?.logo_data_url || seller?.logo || seller?.logo_path;
  let drawn = false;

  try {
    if (logoCandidate && typeof logoCandidate === 'string') {
      if (logoCandidate.startsWith('data:image/')) {
        const b64 = logoCandidate.split(',')[1] || '';
        const buf = Buffer.from(b64, 'base64');
        doc.image(buf, x, y, { fit: [w, h], align: 'left', valign: 'center' });
        drawn = true;
      } else if (fs.existsSync(logoCandidate)) {
        doc.image(logoCandidate, x, y, { fit: [w, h], align: 'left', valign: 'center' });
        drawn = true;
      } else {
        const maybePublic = path.resolve(process.cwd(), logoCandidate);
        if (fs.existsSync(maybePublic)) {
          doc.image(maybePublic, x, y, { fit: [w, h], align: 'left', valign: 'center' });
          drawn = true;
        }
      }
    }
  } catch (_) {
    drawn = false;
  }

  if (!drawn) {
    doc.save();
    doc.roundedRect(x, y + 2, w, h - 4, 12).fill('#F3E8FF');
    doc.restore();
    doc.fillColor('#6D28D9').font('Helvetica-Bold').fontSize(18).text('N', x, y + 12, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#7C3AED').text('NOVA', x, y + 36, { width: w, align: 'center' });
  }
}

function drawInvoicePdf(doc, inv) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const contentW = right - left;

  const brand = '#111827';
  const accent = '#7C3AED';
  const line = '#E5E7EB';
  const soft = '#F8FAFC';
  const muted = '#6B7280';

  const seller = inv.seller || {};
  const customer = inv.customer || {};
  const items = Array.isArray(inv.items) ? inv.items : [];

  const invNo = `${inv.year}/${String(inv.number).padStart(4, '0')}`;

  // Header band
  doc.save();
  doc.rect(0, 0, pageW, 132).fill(brand);
  doc.restore();

  drawLogoOrBadge(doc, seller, left, 24, 62, 62);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('FATTURA', left + 78, 28);
  doc.font('Helvetica').fontSize(10).fillColor('#D1D5DB');
  doc.text(`Numero: ${invNo}`, left + 78, 58);
  doc.text(`Data: ${inv.issue_date || ''}`, left + 78, 74);
  if (inv.due_date) doc.text(`Scadenza: ${inv.due_date}`, left + 78, 90);

  const sellerX = left + contentW * 0.57;
  const sellerW = right - sellerX;
  doc.save();
  doc.roundedRect(sellerX, 22, sellerW, 88, 12).fill('#0B1220').stroke('#374151');
  doc.restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('Cedente / Prestatore', sellerX + 12, 34);
  doc.font('Helvetica').fontSize(9).fillColor('#E5E7EB');
  const sellerLines = [
    safeText(seller.name),
    safeText(seller.address),
    safeText(seller.city),
    seller.vat ? `P.IVA: ${safeText(seller.vat)}` : '',
    seller.cf ? `CF: ${safeText(seller.cf)}` : '',
    seller.iban ? `IBAN: ${safeText(seller.iban)}` : '',
  ].filter(Boolean);
  doc.text(sellerLines.join('\n') || '-', sellerX + 12, 52, {
    width: sellerW - 24,
    lineGap: 2,
  });

  // Customer + meta
  let y = 150;
  const boxGap = 14;
  const cardH = 116;
  const leftCardW = contentW * 0.57;
  const rightCardX = left + leftCardW + boxGap;
  const rightCardW = right - rightCardX;

  doc.save();
  doc.roundedRect(left, y, leftCardW, cardH, 12).fill(soft).stroke(line);
  doc.roundedRect(rightCardX, y, rightCardW, cardH, 12).fill('#FFFFFF').stroke(line);
  doc.restore();

  doc.fillColor(brand).font('Helvetica-Bold').fontSize(10).text('Cessionario / Committente', left + 14, y + 14);
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
  doc.text(custLines.join('\n') || '-', left + 14, y + 34, {
    width: leftCardW - 28,
    lineGap: 2,
  });

  doc.fillColor(brand).font('Helvetica-Bold').fontSize(10).text('Riepilogo documento', rightCardX + 14, y + 14);
  const metaRows = [
    ['Valuta', inv.currency || 'EUR'],
    ['Pagamento', safeText(inv.payment_method || seller.payment_method || 'Bonifico')],
    ['Totale documento', eur(inv.total || 0)],
  ];
  let metaY = y + 40;
  for (const [label, value] of metaRows) {
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(label, rightCardX + 14, metaY);
    doc.fillColor(brand).font('Helvetica-Bold').fontSize(9).text(value, rightCardX + 14, metaY, {
      width: rightCardW - 28,
      align: 'right',
    });
    metaY += 22;
  }

  y += cardH + 22;

  // Items table
  const cols = {
    desc: { x: left, w: contentW * 0.38 },
    qty: { x: left + contentW * 0.38, w: contentW * 0.08 },
    unit: { x: left + contentW * 0.46, w: contentW * 0.14 },
    mode: { x: left + contentW * 0.60, w: contentW * 0.12 },
    vat: { x: left + contentW * 0.72, w: contentW * 0.08 },
    total: { x: left + contentW * 0.80, w: contentW * 0.20 },
  };

  const headerH = 28;
  const cellPadX = 8;
  const cellPadY = 8;
  let tableStartY = y;

  function drawTableHeader() {
    doc.save();
    doc.roundedRect(left, y, contentW, headerH, 10).fill(brand);
    doc.restore();

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('Descrizione', cols.desc.x + cellPadX, y + 9, { width: cols.desc.w - 2 * cellPadX });
    doc.text('Q.tà', cols.qty.x, y + 9, { width: cols.qty.w - 6, align: 'right' });
    doc.text('Prezzo', cols.unit.x, y + 9, { width: cols.unit.w - 6, align: 'right' });
    doc.text('IVA', cols.mode.x + 2, y + 9, { width: cols.mode.w - 4, align: 'center' });
    doc.text('%', cols.vat.x, y + 9, { width: cols.vat.w - 6, align: 'right' });
    doc.text('Totale', cols.total.x, y + 9, { width: cols.total.w - 8, align: 'right' });
    y += headerH + 4;
    tableStartY = tableStartY || y;
  }

  function pageBottom() {
    return pageH - doc.page.margins.bottom - 12;
  }

  function ensureSpace(h) {
    if (y + h > pageBottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      tableStartY = y;
      drawTableHeader();
    }
  }

  drawTableHeader();

  items.forEach((raw, idx) => {
    const it = computeLine(raw);
    const descH = doc.heightOfString(it.description || '-', {
      width: cols.desc.w - 2 * cellPadX,
      align: 'left',
      lineGap: 2,
    });
    const modeLabel = it.vat_mode === 'included' ? 'Compresa' : 'Esclusa';
    const modeH = doc.heightOfString(modeLabel, {
      width: cols.mode.w - 2 * cellPadX,
      align: 'center',
    });
    const rowH = Math.max(30, descH + 2 * cellPadY, modeH + 2 * cellPadY);

    ensureSpace(rowH + 2);

    if (idx % 2 === 0) {
      doc.save();
      doc.roundedRect(left, y, contentW, rowH, 8).fill('#FAFAFA');
      doc.restore();
    }

    doc.save();
    doc.roundedRect(left, y, contentW, rowH, 8).stroke(line);
    [cols.qty.x, cols.unit.x, cols.mode.x, cols.vat.x, cols.total.x].forEach((x) => {
      doc.moveTo(x, y).lineTo(x, y + rowH).stroke(line);
    });
    doc.restore();

    const textY = y + cellPadY;

    doc.fillColor('#111827').font('Helvetica').fontSize(9).text(it.description || '-', cols.desc.x + cellPadX, textY, {
      width: cols.desc.w - 2 * cellPadX,
      lineGap: 2,
    });
    doc.text(String(it.qty).replace('.', ','), cols.qty.x + 2, textY + (rowH > 30 ? (rowH - 18) / 2 - 3 : 0), {
      width: cols.qty.w - 8,
      align: 'right',
    });
    doc.text(eur(it.unit_price), cols.unit.x + 2, textY + (rowH > 30 ? (rowH - 18) / 2 - 3 : 0), {
      width: cols.unit.w - 8,
      align: 'right',
    });
    doc.text(modeLabel, cols.mode.x + 2, textY + (rowH > 30 ? (rowH - 18) / 2 - 3 : 0), {
      width: cols.mode.w - 4,
      align: 'center',
    });
    doc.text(`${it.vat_rate.toFixed(0)}%`, cols.vat.x + 2, textY + (rowH > 30 ? (rowH - 18) / 2 - 3 : 0), {
      width: cols.vat.w - 8,
      align: 'right',
    });
    doc.font('Helvetica-Bold').text(eur(it.line_total), cols.total.x + 2, textY + (rowH > 30 ? (rowH - 18) / 2 - 3 : 0), {
      width: cols.total.w - 8,
      align: 'right',
    });

    y += rowH + 6;
  });

  // Notes and totals
  const notesH = Math.max(
    92,
    doc.heightOfString(inv.notes || '-', {
      width: contentW * 0.52 - 28,
      lineGap: 2,
    }) + 34
  );
  const totalsH = 110;
  const sectionH = Math.max(notesH, totalsH);

  ensureSpace(sectionH + 24);

  const notesW = contentW * 0.54;
  const totalsW = contentW * 0.38;
  const notesX = left;
  const totalsX = right - totalsW;

  doc.save();
  doc.roundedRect(notesX, y + 8, notesW, sectionH, 12).fill('#FFFFFF').stroke(line);
  doc.roundedRect(totalsX, y + 8, totalsW, sectionH, 12).fill('#0B1220').stroke('#374151');
  doc.restore();

  doc.fillColor(accent).font('Helvetica-Bold').fontSize(10).text('Note', notesX + 14, y + 22);
  doc.fillColor('#111827').font('Helvetica').fontSize(9).text(inv.notes || '-', notesX + 14, y + 40, {
    width: notesW - 28,
    lineGap: 2,
  });

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('Totali', totalsX + 14, y + 22);

  const totalsRows = [
    ['Imponibile', eur(inv.subtotal || 0)],
    ['IVA', eur(inv.vat || 0)],
    ['Totale', eur(inv.total || 0)],
  ];

  let tY = y + 48;
  totalsRows.forEach(([label, value], index) => {
    if (index === 2) {
      doc.save();
      doc.moveTo(totalsX + 14, tY - 10).lineTo(totalsX + totalsW - 14, tY - 10).stroke('#374151');
      doc.restore();
    }
    doc.fillColor('#9CA3AF').font(index === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(label, totalsX + 14, tY);
    doc.fillColor('#FFFFFF').font(index === 2 ? 'Helvetica-Bold' : 'Helvetica').text(value, totalsX + 14, tY, {
      width: totalsW - 28,
      align: 'right',
    });
    tY += 24;
  });

  // Footer
  doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(
    'Documento generato dal Gestionale Nova',
    left,
    pageH - doc.page.margins.bottom + 10,
    { width: contentW, align: 'center' }
  );
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

    const number = toInt(body.number, null);

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
