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
  // accetta "YYYY-MM-DD" o ISO
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
// GET /api/report/full
// ----------------------
router.get('/full', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [financialRowsRaw, opRowsRaw, totalsRaw] = await Promise.all([
      rpc('report_financial_statement', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
      rpc('report_operating_result', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
      rpc('report_global_totals', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
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

    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
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
      rpc('report_financial_statement', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
      rpc('report_operating_result', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
      rpc('report_global_totals', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
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

    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gest ASD';
    wb.created = new Date();

    // Sheet 1: Rendiconto finanziario
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
    sh1.addRow({ description: 'Totali', cassaIn: recap.cassaIn, cassaOut: recap.cassaOut, bancaIn: recap.bancaIn, bancaOut: recap.bancaOut });
    sh1.addRow({ description: 'Saldi', cassaIn: recap.cassaSaldo, bancaIn: recap.bancaSaldo });

    // Sheet 2: Risultato operativo
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

    // Sheet 3: Global
    const sh3 = wb.addWorksheet('Totali');
    sh3.columns = [
      { header: 'Voce', key: 'k', width: 25 },
      { header: 'Valore', key: 'v', width: 18 },
    ];
    sh3.getRow(1).font = { bold: true };
    sh3.addRow({ k: 'Totale entrate', v: global.totalEntrate });
    sh3.addRow({ k: 'Totale uscite', v: global.totalUscite });
    sh3.addRow({ k: 'Saldo', v: global.saldo });
    sh3.addRow({ k: 'IVA (somma)', v: global.totalVat });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${from || 'all'}_${to || 'all'}.xlsx"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Errore /report/export/xlsx:', err.details || err);
    res.status(500).json({ error: 'Errore export Excel' });
  }
});

// ----------------------
// GET /api/report/export/pdf
// PDF semplice: Rendiconto finanziario + Totali
// ----------------------
router.get('/export/pdf', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [financialRowsRaw, totalsRaw] = await Promise.all([
      rpc('report_financial_statement', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
      rpc('report_global_totals', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
      }),
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
    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    const global = {
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${from || 'all'}_${to || 'all'}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text('Report Contabilità', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Periodo: ${from || '—'} → ${to || '—'}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).text('Totali', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Entrate: ${formatEuro(global.totalEntrate)}`);
    doc.text(`Uscite:  ${formatEuro(global.totalUscite)}`);
    doc.text(`Saldo:   ${formatEuro(global.saldo)}`);
    doc.text(`IVA:     ${formatEuro(global.totalVat)}`);
    doc.moveDown(1);

    doc.fontSize(12).text('Rendiconto finanziario (analitico)', { underline: true });
    doc.moveDown(0.5);

    // tabella semplice
    const maxRows = 2000; // sicurezza (PDF lunghi sono pesanti)
    const rowsToPrint = financialRows.slice(0, maxRows);

    doc.fontSize(9);
    for (const r of rowsToPrint) {
      const line =
        `${fmtDate(r.date)} | ${String(r.conto || '-').padEnd(4)} | ` +
        `${(r.description || '').slice(0, 45)} | ` +
        `Cassa: ${formatEuro(r.cassaIn - r.cassaOut)} | ` +
        `Banca: ${formatEuro(r.bancaIn - r.bancaOut)}`;
      doc.text(line);
      if (doc.y > 760) doc.addPage();
    }

    doc.moveDown(1);
    doc.fontSize(10).text(`Recap Cassa IN/OUT: ${formatEuro(recap.cassaIn)} / ${formatEuro(recap.cassaOut)}`);
    doc.text(`Recap Banca IN/OUT: ${formatEuro(recap.bancaIn)} / ${formatEuro(recap.bancaOut)}`);
    doc.text(`Saldo Cassa: ${formatEuro(recap.cassaSaldo)} | Saldo Banca: ${formatEuro(recap.bancaSaldo)}`);

    doc.end();
  } catch (err) {
    console.error('Errore /report/export/pdf:', err.details || err);
    res.status(500).json({ error: 'Errore export PDF' });
  }
});

// ----------------------
// GET /api/report/rendiconto/pdf
// PDF raggruppato per data+descrizione (super leggero)
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rendiconto_${from || 'all'}_${to || 'all'}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text('Rendiconto (Raggruppato)', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Periodo: ${from || '—'} → ${to || '—'}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(9);
    for (const r of rows) {
      const line =
        `${fmtDate(r.date)} | ${(r.description || '').slice(0, 60)} | ` +
        `Entrate: ${formatEuro(r.entrate)} | Uscite: ${formatEuro(r.uscite)}`;
      doc.text(line);
      if (doc.y > 760) doc.addPage();
    }

    doc.end();
  } catch (err) {
    console.error('Errore /report/rendiconto/pdf:', err.details || err);
    res.status(500).json({ error: 'Errore PDF rendiconto' });
  }
});

// ----------------------
// GET /api/report/summary
// Restituisce solo i totali globali
// ----------------------
router.get('/summary', async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const totalsRaw = await rpc('report_global_totals', {
      p_user_id: req.user.id,
      p_from: from,
      p_to: to,
    });

    const t = (totalsRaw && totalsRaw[0]) ? totalsRaw[0] : {};
    return res.json({
      totalEntrate: Number(num(t.total_entrate).toFixed(2)),
      totalUscite: Number(num(t.total_uscite).toFixed(2)),
      saldo: Number(num(t.saldo).toFixed(2)),
      totalVat: Number(num(t.total_vat).toFixed(2)),
      meta: { from, to },
    });
  } catch (err) {
    console.error('Errore /report/summary:', err.details || err);
    res.status(500).json({ error: 'Errore summary report' });
  }
});

module.exports = router;
