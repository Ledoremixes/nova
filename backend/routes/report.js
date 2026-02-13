const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ----------------------
// Helpers
// ----------------------
function toISODateOrNull(x) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
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

function buildRecapFromFinancialRows(rows) {
  const recap = { cassaIn: 0, cassaOut: 0, bancaIn: 0, bancaOut: 0 };
  for (const r of rows) {
    recap.cassaIn += num(r.cassa_in ?? r.cassain ?? r.cassaIn);
    recap.cassaOut += num(r.cassa_out ?? r.cassaout ?? r.cassaOut);
    recap.bancaIn += num(r.banca_in ?? r.bancain ?? r.bancaIn);
    recap.bancaOut += num(r.banca_out ?? r.bancaout ?? r.bancaOut);
  }
  recap.cassaIn = Number(recap.cassaIn.toFixed(2));
  recap.cassaOut = Number(recap.cassaOut.toFixed(2));
  recap.bancaIn = Number(recap.bancaIn.toFixed(2));
  recap.bancaOut = Number(recap.bancaOut.toFixed(2));
  recap.cassaSaldo = Number((recap.cassaIn - recap.cassaOut).toFixed(2));
  recap.bancaSaldo = Number((recap.bancaIn - recap.bancaOut).toFixed(2));
  return recap;
}

function formatEuro(v) {
  const n = num(v);
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function fmtDate(d) {
  if (!d) return '';
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return String(d);
    return x.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

// ----------------------
// Mapping commerciale/istituzionale ASD
// - Commerciale: SOLO account_code === "C" (bar)
// - IVA: conteggia SOLO righe con account_code === "C"
// ----------------------
function isCommercialByAccountCode(code) {
  return String(code || '').trim().toUpperCase() === 'C';
}

// ----------------------
// PDF helpers (stessa grafica Report IVA)
// ----------------------
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
      doc.text(c.label, cx + 6, cursorY + 6, {
        width: c.width - 12,
        align: c.align || 'left',
      });
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
      doc.text(String(val), cx + 6, cursorY + 5, {
        width: c.width - 12,
        align: c.align || 'left',
      });
      cx += c.width;
    }
    cursorY += rowHeight;
  });

  return cursorY;
}

function drawSummaryBox(doc, { from, to, global, recap }) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;
  const h = 140;

  doc.save();
  doc.roundedRect(x, y, w, h, 10).fill('#0B1220');
  doc.restore();

  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text('Riepilogo', x + 14, y + 12);
  doc.font('Helvetica').fontSize(10);

  doc.fillColor('#9CA3AF').text(`Periodo: ${from || '—'} → ${to || '—'}`, x + 14, y + 32);
  doc.fillColor('#fff');

  doc.text(`Entrate totali: ${formatEuro(global.totalEntrate)}`, x + 14, y + 54);
  doc.text(`Uscite totali: ${formatEuro(global.totalUscite)}`, x + 14, y + 70);
  doc.text(`Saldo: ${formatEuro(global.saldo)}`, x + 14, y + 86);

  doc.text(`Entrate istituzionali: ${formatEuro(global.totalEntrateIstituzionali)}`, x + 290, y + 54);
  doc.text(`Entrate commerciali (Bar - C): ${formatEuro(global.totalEntrateCommerciali)}`, x + 290, y + 70);
  doc.text(`IVA (solo Bar - C): ${formatEuro(global.totalVat)}`, x + 290, y + 86);

  doc.fillColor('#9CA3AF').fontSize(9).text(
    `Recap Cassa IN/OUT: ${formatEuro(recap.cassaIn)} / ${formatEuro(recap.cassaOut)}   |   ` +
      `Banca IN/OUT: ${formatEuro(recap.bancaIn)} / ${formatEuro(recap.bancaOut)}   |   ` +
      `Saldo Cassa: ${formatEuro(recap.cassaSaldo)}   |   Saldo Banca: ${formatEuro(recap.bancaSaldo)}`,
    x + 14,
    y + 112,
    { width: w - 28 }
  );

  doc.fillColor('#000');
  doc.y = y + h + 16;
}

// ----------------------
// GET /api/report/full
// ----------------------
router.get('/full', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [financialRowsRaw, opRowsRaw, totalsRaw] = await Promise.all([
      rpc('report_financial_statement', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_operating_result', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_global_totals', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    const financialRows = (financialRowsRaw || []).map((r) => ({
      date: r.date,
      description: r.description,
      conto: r.conto,
      nature: r.nature,
      cassaIn: num(r.cassa_in),
      cassaOut: num(r.cassa_out),
      bancaIn: num(r.banca_in),
      bancaOut: num(r.banca_out),
    }));

    const recap = buildRecapFromFinancialRows(financialRows);

    const opRows = (opRowsRaw || []).map((r) => ({
      accountCode: r.account_code,
      accountName: r.account_name,
      nature: r.nature,
      entrate: Number(num(r.entrate).toFixed(2)),
      uscite: Number(num(r.uscite).toFixed(2)),
    }));

    const t = totalsRaw?.[0] || {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
      totalEntrateIstituzionali: Number(num(t.total_entrate_istituzionali).toFixed(2)),
      totalEntrateCommerciali: Number(num(t.total_entrate_commerciali).toFixed(2)),
    };

    return res.json({
      financialStatement: { rows: financialRows, recap },
      operatingResult: { rows: opRows },
      global,
    });
  } catch (err) {
    console.error('Errore /report/full:', err.details || err);
    res.status(500).json({ error: 'Errore report completo' });
  }
});

// ----------------------
// GET /api/report/export/xlsx
// ----------------------
router.get('/export/xlsx', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [financialRowsRaw, opRowsRaw, totalsRaw] = await Promise.all([
      rpc('report_financial_statement', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_operating_result', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_global_totals', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    const financialRows = (financialRowsRaw || []).map((r) => ({
      date: r.date,
      description: r.description,
      conto: r.conto,
      nature: r.nature,
      cassaIn: num(r.cassa_in),
      cassaOut: num(r.cassa_out),
      bancaIn: num(r.banca_in),
      bancaOut: num(r.banca_out),
    }));

    const recap = buildRecapFromFinancialRows(financialRows);

    const opRows = (opRowsRaw || []).map((r) => ({
      accountCode: r.account_code,
      accountName: r.account_name,
      nature: r.nature,
      entrate: Number(num(r.entrate).toFixed(2)),
      uscite: Number(num(r.uscite).toFixed(2)),
    }));

    const t = totalsRaw?.[0] || {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
      totalEntrateIstituzionali: Number(num(t.total_entrate_istituzionali).toFixed(2)),
      totalEntrateCommerciali: Number(num(t.total_entrate_commerciali).toFixed(2)),
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gest ASD';
    wb.created = new Date();

    const sh1 = wb.addWorksheet('Rendiconto finanziario');
    sh1.columns = [
      { header: 'Data', key: 'date', width: 12 },
      { header: 'Descrizione', key: 'description', width: 45 },
      { header: 'Conto', key: 'conto', width: 10 },
      { header: 'Natura', key: 'nature', width: 18 },
      { header: 'Cassa IN', key: 'cassaIn', width: 12 },
      { header: 'Cassa OUT', key: 'cassaOut', width: 12 },
      { header: 'Banca IN', key: 'bancaIn', width: 12 },
      { header: 'Banca OUT', key: 'bancaOut', width: 12 },
    ];
    sh1.getRow(1).font = { bold: true };

    financialRows.forEach((r) => {
      sh1.addRow({
        date: fmtDate(r.date),
        description: r.description,
        conto: r.conto,
        nature: r.nature,
        cassaIn: r.cassaIn,
        cassaOut: r.cassaOut,
        bancaIn: r.bancaIn,
        bancaOut: r.bancaOut,
      });
    });

    sh1.addRow({});
    sh1.addRow({
      description: 'Totali',
      cassaIn: recap.cassaIn,
      cassaOut: recap.cassaOut,
      bancaIn: recap.bancaIn,
      bancaOut: recap.bancaOut,
    });
    sh1.addRow({ description: 'Saldi', cassaIn: recap.cassaSaldo, bancaIn: recap.bancaSaldo });

    const sh2 = wb.addWorksheet('Risultato operativo');
    sh2.columns = [
      { header: 'Codice conto', key: 'accountCode', width: 14 },
      { header: 'Nome conto', key: 'accountName', width: 30 },
      { header: 'Natura', key: 'nature', width: 18 },
      { header: 'Entrate', key: 'entrate', width: 14 },
      { header: 'Uscite', key: 'uscite', width: 14 },
    ];
    sh2.getRow(1).font = { bold: true };
    opRows.forEach((r) => sh2.addRow(r));

    const sh3 = wb.addWorksheet('Totali');
    sh3.columns = [
      { header: 'Voce', key: 'k', width: 30 },
      { header: 'Valore', key: 'v', width: 18 },
    ];
    sh3.getRow(1).font = { bold: true };
    sh3.addRow({ k: 'Totale entrate', v: global.totalEntrate });
    sh3.addRow({ k: 'Totale uscite', v: global.totalUscite });
    sh3.addRow({ k: 'Saldo', v: global.saldo });
    sh3.addRow({ k: 'Entrate istituzionali', v: global.totalEntrateIstituzionali });
    sh3.addRow({ k: 'Entrate commerciali (Bar - C)', v: global.totalEntrateCommerciali });
    sh3.addRow({ k: 'IVA (solo Bar - C)', v: global.totalVat });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report_${from || 'all'}_${to || 'all'}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Errore /report/export/xlsx:', err.details || err);
    res.status(500).json({ error: 'Errore export Excel' });
  }
});

// ----------------------
// GET /api/report/export/pdf
// PDF "bello" stile report IVA: box riepilogo + tabella righe
// ----------------------
router.get('/export/pdf', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [financialRowsRaw, totalsRaw] = await Promise.all([
      rpc('report_financial_statement', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_global_totals', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    const financialRows = (financialRowsRaw || []).map((r) => ({
      date: r.date,
      description: r.description,
      conto: r.conto,
      nature: r.nature,
      cassaIn: num(r.cassa_in),
      cassaOut: num(r.cassa_out),
      bancaIn: num(r.banca_in),
      bancaOut: num(r.banca_out),
    }));

    const recap = buildRecapFromFinancialRows(financialRows);

    const t = totalsRaw?.[0] || {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
      totalEntrateIstituzionali: Number(num(t.total_entrate_istituzionali).toFixed(2)),
      totalEntrateCommerciali: Number(num(t.total_entrate_commerciali).toFixed(2)),
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rendiconto_${from || 'all'}_${to || 'all'}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    // Titolo
    doc.font('Helvetica-Bold').fontSize(16).text('Rendiconto (ASD)', { align: 'left' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text('Rendiconto finanziario + riepilogo istituzionale/commerciale (Bar = conto C).');
    doc.fillColor('#000');
    doc.moveDown(0.8);

    // Box riepilogo in stile IVA
    drawSummaryBox(doc, { from, to, global, recap });

    // Tabella righe (A4-safe)
    doc.font('Helvetica-Bold').fontSize(12).text('Rendiconto finanziario (analitico)');
    doc.moveDown(0.4);

    const rows = (financialRows || []).map((r) => {
      const cassa = Number((num(r.cassaIn) - num(r.cassaOut)).toFixed(2));
      const banca = Number((num(r.bancaIn) - num(r.bancaOut)).toFixed(2));
      const tot = Number((cassa + banca).toFixed(2));

      return {
        date: fmtDate(r.date),
        conto: String(r.conto || '').toUpperCase(),
        description: (r.description || '').replace(/\s+/g, ' ').trim().slice(0, 45),
        cassa: formatEuro(cassa),
        banca: formatEuro(banca),
        totale: formatEuro(tot),
      };
    });

    // larghezza utile A4: 515 (con margini 40)
    drawTable(doc, {
      x: doc.page.margins.left,
      y: doc.y,
      columns: [
        { key: 'date', label: 'Data', width: 60 },
        { key: 'conto', label: 'Conto', width: 50 },
        { key: 'description', label: 'Descrizione', width: 210 },
        { key: 'cassa', label: 'Cassa', width: 65, align: 'right' },
        { key: 'banca', label: 'Banca', width: 65, align: 'right' },
        { key: 'totale', label: 'Totale', width: 65, align: 'right' },
      ],
      rows,
      rowHeight: 17,
      headerHeight: 20,
    });

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(
      'Nota: “Commerciale” nel riepilogo = sole entrate su conto C (Bar). IVA conteggiata solo su conto C.'
    );
    doc.fillColor('#000');

    doc.end();
  } catch (err) {
    console.error('Errore /report/export/pdf:', err.details || err);
    res.status(500).json({ error: 'Errore export PDF' });
  }
});

// ----------------------
// GET /api/report/rendiconto/pdf
// PDF raggruppato per data+descrizione (super leggero) - lasciato com’è
// ----------------------
router.get('/rendiconto/pdf', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const rows = await rpc('report_rendiconto_grouped', {
      p_user_id: req.user.id,
      p_from: from,
      p_to: to,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rendiconto_grouped_${from || 'all'}_${to || 'all'}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).text('Rendiconto (Raggruppato)');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`Periodo: ${from || '—'} → ${to || '—'}`);
    doc.fillColor('#000');
    doc.moveDown(0.8);

    const tableRows = (rows || []).map((r) => ({
      date: fmtDate(r.date),
      description: (r.description || '').replace(/\s+/g, ' ').trim().slice(0, 55),
      entrate: formatEuro(r.entrate),
      uscite: formatEuro(r.uscite),
    }));

    drawTable(doc, {
      x: doc.page.margins.left,
      y: doc.y,
      columns: [
        { key: 'date', label: 'Data', width: 70 },
        { key: 'description', label: 'Descrizione', width: 270 },
        { key: 'entrate', label: 'Entrate', width: 85, align: 'right' },
        { key: 'uscite', label: 'Uscite', width: 90, align: 'right' },
      ],
      rows: tableRows,
      rowHeight: 17,
      headerHeight: 20,
    });

    doc.end();
  } catch (err) {
    console.error('Errore /report/rendiconto/pdf:', err.details || err);
    res.status(500).json({ error: 'Errore PDF rendiconto' });
  }
});

// ----------------------
// GET /api/report/summary
// ----------------------
router.get('/summary', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [totalsRaw, opRowsRaw] = await Promise.all([
      rpc('report_global_totals', { p_user_id: req.user.id, p_from: from, p_to: to }),
      rpc('report_operating_result', { p_user_id: req.user.id, p_from: from, p_to: to }),
    ]);

    const t = totalsRaw?.[0] || {};
    const totalEntrate = Number(num(t.total_entrate).toFixed(2));
    const totalUscite = Number(num(t.total_uscite).toFixed(2));
    const saldo = Number(num(t.saldo).toFixed(2));

    let totalEntrateCommerciali = num(t.total_entrate_commerciali);
    let totalEntrateIstituzionali = num(t.total_entrate_istituzionali);
    let totalVat = num(t.total_vat);

    let calcComm = 0;
    let calcIst = 0;

    const rows = (opRowsRaw || []).map((r) => {
      const code = r.account_code;
      const name = r.account_name;

      const entrate = Number(num(r.entrate).toFixed(2));
      const uscite = Number(num(r.uscite).toFixed(2));
      const saldoRow = Number((entrate - uscite).toFixed(2));

      const isComm = isCommercialByAccountCode(code);
      const entrateComm = isComm ? entrate : 0;
      const entrateIst = isComm ? 0 : entrate;

      calcComm += entrateComm;
      calcIst += entrateIst;

      let type = 'Misto';
      if (entrate > 0 && uscite === 0) type = 'Entrata';
      if (uscite > 0 && entrate === 0) type = 'Uscita';

      return {
        code,
        name,
        type,
        entrate,
        uscite,
        saldo: saldoRow,
        entrateIstituzionali: Number(entrateIst.toFixed(2)),
        entrateCommerciali: Number(entrateComm.toFixed(2)),
        vatAmount: 0,
      };
    });

    if (!Number.isFinite(totalEntrateCommerciali) || totalEntrateCommerciali === 0) {
      totalEntrateCommerciali = Number(calcComm.toFixed(2));
    }
    if (!Number.isFinite(totalEntrateIstituzionali) || totalEntrateIstituzionali === 0) {
      totalEntrateIstituzionali = Number(calcIst.toFixed(2));
    }

    rows.sort((a, b) => String(a.code).localeCompare(String(b.code), 'it', { numeric: true }));

    return res.json({
      rows,
      totalEntrate,
      totalUscite,
      saldo,
      totalEntrateIstituzionali: Number(num(totalEntrateIstituzionali).toFixed(2)),
      totalEntrateCommerciali: Number(num(totalEntrateCommerciali).toFixed(2)),
      totalVat: Number(num(totalVat).toFixed(2)),
      meta: { from, to },
    });
  } catch (err) {
    console.error('Errore /report/summary:', err.details || err);
    return res.status(500).json({
      error: 'Errore summary report',
      message: err.message,
      details: err.details || null,
    });
  }
});

module.exports = router;
