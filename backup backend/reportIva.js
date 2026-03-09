const express = require('express');
const PDFDocument = require('pdfkit');

const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ----------------------
// Helpers
// ----------------------
function toISOTsOrNull(x) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString(); // timestamptz
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function euro(v) {
  return num(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toISOString().slice(0, 10);
}

async function rpc(fnName, params) {
  const { data, error } = await supabase.rpc(fnName, params);
  if (error) {
    const e = new Error(error.message || 'RPC error');
    e.details = error;
    throw e;
  }
  return data || [];
}

// Tabella PDF semplice con page break
function drawTable(doc, { x, y, columns, rows, headerHeight = 20, rowHeight = 18 }) {
  let cursorY = y;
  const tableW = columns.reduce((s, c) => s + c.width, 0);
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const drawHeader = () => {
    doc.save();
    doc.rect(x, cursorY, tableW, headerHeight).fill('#111827');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    let cx = x;
    for (const c of columns) {
      doc.text(c.label, cx + 6, cursorY + 6, { width: c.width - 12, align: c.align || 'left' });
      cx += c.width;
    }
    doc.restore();
    cursorY += headerHeight;
  };

  const ensure = (need) => {
    if (cursorY + need > bottom()) {
      doc.addPage();
      cursorY = doc.page.margins.top;
      drawHeader();
    }
  };

  drawHeader();

  doc.font('Helvetica').fontSize(8.7).fillColor('#000');
  rows.forEach((r, idx) => {
    ensure(rowHeight);

    if (idx % 2 === 0) {
      doc.save();
      doc.rect(x, cursorY, tableW, rowHeight).fill('#F3F4F6');
      doc.restore();
    }

    let cx = x;
    for (const c of columns) {
      const val = r[c.key] ?? '';
      doc.text(String(val), cx + 6, cursorY + 5, { width: c.width - 12, align: c.align || 'left' });
      cx += c.width;
    }
    cursorY += rowHeight;
  });

  return cursorY;
}

// ----------------------
// GET /api/reportIva/data
// JSON per Bilancio.jsx
// ----------------------
router.get('/data', async (req, res) => {
  try {
    const from = toISOTsOrNull(req.query.from);
    const to = toISOTsOrNull(req.query.to);

    const [sumRaw, byRateRaw, rowsRaw] = await Promise.all([
      rpc('iva_commercialista_summary', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('iva_commercialista_by_rate', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('iva_commercialista_rows', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    res.json({
      summary: sumRaw?.[0] || null,
      byRate: byRateRaw || [],
      rows: rowsRaw || [],
      meta: { from, to },
    });
  } catch (err) {
    console.error('Errore /reportIva/data:', err.details || err);
    res.status(500).json({ error: 'Errore report IVA data', message: err.message });
  }
});

// ----------------------
// GET /api/reportIva/pdf
// PDF “bello” e leggibile
// ----------------------
router.get('/pdf', async (req, res) => {
  try {
    const from = toISOTsOrNull(req.query.from);
    const to = toISOTsOrNull(req.query.to);

    const [sumRaw, byRateRaw, rowsRaw] = await Promise.all([
      rpc('iva_commercialista_summary', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('iva_commercialista_by_rate', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('iva_commercialista_rows', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    const summary = sumRaw?.[0] || {
      entrate_istituzionali: 0,
      entrate_commerciali: 0,
      imponibile_commerciale: 0,
      iva_commerciale: 0,
      totale_commerciale: 0,
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Report_IVA_Commercialista_${(from || 'all').slice(0,10)}_${(to || 'all').slice(0,10)}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(16).text('Report IVA Club Orchidea asd');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`Periodo: ${from ? from.slice(0,10) : '—'} → ${to ? to.slice(0,10) : '—'}`);
    doc.fillColor('#000');
    doc.moveDown(0.8);

    // Box riepilogo
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.y;
    const h = 112;

    doc.save();
    doc.roundedRect(x, y, w, h, 10).fill('#0B1220');
    doc.restore();

    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text('Riepilogo', x + 14, y + 12);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Entrate istituzionali: ${euro(summary.entrate_istituzionali)}`, x + 14, y + 36);
    doc.text(`Entrate commerciali (Bar - conto C): ${euro(summary.entrate_commerciali)}`, x + 14, y + 54);

    doc.font('Helvetica-Bold').text('IVA (solo Bar - conto C)', x + 14, y + 78);
    doc.font('Helvetica').text(
      `Imponibile: ${euro(summary.imponibile_commerciale)}   IVA: ${euro(summary.iva_commerciale)}   Totale: ${euro(summary.totale_commerciale)}`,
      x + 14, y + 95
    );

    doc.fillColor('#000');
    doc.y = y + h + 16;

    // Tabella aliquote
    doc.font('Helvetica-Bold').fontSize(12).text('Dettaglio IVA per aliquota (solo Bar - C)');
    doc.moveDown(0.4);

    const rateRows = (byRateRaw || []).map(r => ({
      vat_rate: r.vat_rate == null ? '—' : `${Number(r.vat_rate).toFixed(0)}%`,
      imponibile: euro(r.imponibile),
      iva: euro(r.iva),
      totale: euro(r.totale),
      count: r.count ?? 0,
    }));

    let yy = drawTable(doc, {
      x: doc.page.margins.left,
      y: doc.y,
      columns: [
        { key: 'vat_rate', label: 'Aliquota', width: 70 },
        { key: 'count', label: 'N°', width: 45, align: 'right' },
        { key: 'imponibile', label: 'Imponibile', width: 140, align: 'right' },
        { key: 'iva', label: 'IVA', width: 110, align: 'right' },
        { key: 'totale', label: 'Totale', width: 140, align: 'right' },
      ],
      rows: rateRows,
    });

    doc.y = yy + 14;

    // Tabella righe
    doc.font('Helvetica-Bold').fontSize(12).text('Righe IVA (solo Bar - C)');
    doc.moveDown(0.4);

    const detailRows = (rowsRaw || []).map((r) => ({
      date: fmtDate(r.date),
      // ✅ stringo descrizione per stare in A4
      description: (r.description || '').replace(/\s+/g, ' ').trim().slice(0, 42),
      vat_rate: r.vat_rate == null ? '—' : `${Number(r.vat_rate).toFixed(0)}%`,
      imponibile: euro(r.imponibile),
      iva: euro(r.iva),
      totale: euro(r.totale),
    }));

    drawTable(doc, {
      x: doc.page.margins.left,
      y: doc.y,
      // ✅ colonne ricalibrate per A4 (somma = 515)
      columns: [
        { key: 'date', label: 'Data', width: 60 },
        { key: 'description', label: 'Descrizione', width: 185 },
        { key: 'vat_rate', label: 'Aliq.', width: 45, align: 'right' },
        { key: 'imponibile', label: 'Imponibile', width: 75, align: 'right' },
        { key: 'iva', label: 'IVA', width: 65, align: 'right' },
        { key: 'totale', label: 'Totale', width: 85, align: 'right' },
      ],
      rows: detailRows,
      // ✅ leggermente più compatto
      rowHeight: 17,
      headerHeight: 20,
    });


    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text('Nota: la divisione istituzionale/commerciale segue la regola: commerciale = conto C (Bar). L’IVA è calcolata e mostrata solo sulle righe del conto C.');
    doc.fillColor('#000');

    doc.end();
  } catch (err) {
    console.error('Errore /reportIva/pdf:', err.details || err);
    res.status(500).json({ error: 'Errore PDF report IVA', message: err.message });
  }
});

module.exports = router;
