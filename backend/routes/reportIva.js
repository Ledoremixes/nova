const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { supabase } = require('../supabaseClient');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();
router.use(auth);

// ======================
// CONFIG
// ======================
// se vuoi includere anche altri conti IVA (es. C per Bar, ecc.), aggiungili qui
const IVA_ACCOUNT_CODES = ['C'];

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

function computeTotalsFromSummary(summaryRows) {
  const totals = { imponibile: 0, iva: 0, totale: 0, count: 0 };
  for (const r of summaryRows || []) {
    totals.imponibile += num(r.imponibile);
    totals.iva += num(r.iva);
    totals.totale += num(r.totale);
    totals.count += Number(r.count || 0);
  }
  totals.imponibile = Number(totals.imponibile.toFixed(2));
  totals.iva = Number(totals.iva.toFixed(2));
  totals.totale = Number(totals.totale.toFixed(2));
  return totals;
}

function formatEuro(v) {
  const n = num(v);
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// ======================
// API DATA: monthly-nature (per la pagina Contabilità)
// ======================
router.get('/iva/monthly-nature', requireAdmin, async (req, res) => {
  try {
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [summaryRowsRaw, detailRowsRaw] = await Promise.all([
      rpc('iva_monthly_nature', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
        p_account_codes: IVA_ACCOUNT_CODES,
      }),
      rpc('iva_monthly_nature_detail', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
        p_account_codes: IVA_ACCOUNT_CODES,
      }),
    ]);

    const summaryRows = (summaryRowsRaw || []).map((r) => ({
      month: r.month,
      nature: r.nature,
      vatRate: r.vat_rate === null ? null : num(r.vat_rate),
      imponibile: Number(num(r.imponibile).toFixed(2)),
      iva: Number(num(r.iva).toFixed(2)),
      totale: Number(num(r.totale).toFixed(2)),
      count: Number(r.count || 0),
    }));

    const detailRows = (detailRowsRaw || []).map((r) => ({
      month: r.month,
      nature: r.nature,
      accountCode: r.account_code,
      accountName: r.account_name,
      vatRate: r.vat_rate === null ? null : num(r.vat_rate),
      imponibile: Number(num(r.imponibile).toFixed(2)),
      iva: Number(num(r.iva).toFixed(2)),
      totale: Number(num(r.totale).toFixed(2)),
      count: Number(r.count || 0),
    }));

    const totals = computeTotalsFromSummary(summaryRows);

    return res.json({
      summaryRows,
      detailRows,
      totals,
      meta: {
        from,
        to,
        accountCodes: IVA_ACCOUNT_CODES,
      },
    });
  } catch (err) {
    console.error('GET /report/iva/monthly-nature:', err.details || err);
    res.status(500).json({ error: 'Errore report IVA' });
  }
});

// ======================
// EXPORT: /api/report/iva/export/:format (xlsx | pdf)
// ======================
router.get('/iva/export/:format', requireAdmin, async (req, res) => {
  try {
    const { format } = req.params;
    const from = toISODateOrNull(req.query.from);
    const to = toISODateOrNull(req.query.to);

    const [summaryRowsRaw, detailRowsRaw] = await Promise.all([
      rpc('iva_monthly_nature', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
        p_account_codes: IVA_ACCOUNT_CODES,
      }),
      rpc('iva_monthly_nature_detail', {
        p_user_id: req.user.id,
        p_from: from,
        p_to: to,
        p_account_codes: IVA_ACCOUNT_CODES,
      }),
    ]);

    const summaryRows = (summaryRowsRaw || []).map((r) => ({
      month: r.month,
      nature: r.nature,
      vatRate: r.vat_rate === null ? null : num(r.vat_rate),
      imponibile: Number(num(r.imponibile).toFixed(2)),
      iva: Number(num(r.iva).toFixed(2)),
      totale: Number(num(r.totale).toFixed(2)),
      count: Number(r.count || 0),
    }));

    const detailRows = (detailRowsRaw || []).map((r) => ({
      month: r.month,
      nature: r.nature,
      accountCode: r.account_code,
      accountName: r.account_name,
      vatRate: r.vat_rate === null ? null : num(r.vat_rate),
      imponibile: Number(num(r.imponibile).toFixed(2)),
      iva: Number(num(r.iva).toFixed(2)),
      totale: Number(num(r.totale).toFixed(2)),
      count: Number(r.count || 0),
    }));

    const totals = computeTotalsFromSummary(summaryRows);

    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Gest ASD';
      wb.created = new Date();

      const sh1 = wb.addWorksheet('IVA - Summary');
      sh1.columns = [
        { header: 'Mese', key: 'month', width: 10 },
        { header: 'Natura', key: 'nature', width: 18 },
        { header: 'Aliquota', key: 'vatRate', width: 10 },
        { header: 'Imponibile', key: 'imponibile', width: 14 },
        { header: 'IVA', key: 'iva', width: 14 },
        { header: 'Totale', key: 'totale', width: 14 },
        { header: 'N. righe', key: 'count', width: 10 },
      ];
      sh1.getRow(1).font = { bold: true };
      summaryRows.forEach((r) => sh1.addRow(r));
      sh1.addRow({});
      sh1.addRow({
        month: 'TOTALE',
        imponibile: totals.imponibile,
        iva: totals.iva,
        totale: totals.totale,
        count: totals.count,
      });

      const sh2 = wb.addWorksheet('IVA - Dettaglio');
      sh2.columns = [
        { header: 'Mese', key: 'month', width: 10 },
        { header: 'Natura', key: 'nature', width: 18 },
        { header: 'Conto', key: 'accountCode', width: 10 },
        { header: 'Nome conto', key: 'accountName', width: 28 },
        { header: 'Aliquota', key: 'vatRate', width: 10 },
        { header: 'Imponibile', key: 'imponibile', width: 14 },
        { header: 'IVA', key: 'iva', width: 14 },
        { header: 'Totale', key: 'totale', width: 14 },
        { header: 'N. righe', key: 'count', width: 10 },
      ];
      sh2.getRow(1).font = { bold: true };
      detailRows.forEach((r) => sh2.addRow(r));

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="iva_${from || 'all'}_${to || 'all'}.xlsx"`
      );

      await wb.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="iva_${from || 'all'}_${to || 'all'}.pdf"`
      );

      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      doc.pipe(res);

      doc.fontSize(16).text('Report IVA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Periodo: ${from || '—'} → ${to || '—'}`, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(12).text('Totali', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Imponibile: ${formatEuro(totals.imponibile)}`);
      doc.text(`IVA:        ${formatEuro(totals.iva)}`);
      doc.text(`Totale:     ${formatEuro(totals.totale)}`);
      doc.text(`Righe:      ${totals.count}`);
      doc.moveDown(1);

      doc.fontSize(12).text('Riepilogo per mese/natura/aliquota', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);

      for (const r of summaryRows) {
        const line =
          `${r.month} | ${String(r.nature || '').padEnd(14)} | ` +
          `Aliq: ${(r.vatRate ?? '—')} | ` +
          `Imp: ${formatEuro(r.imponibile)} | IVA: ${formatEuro(r.iva)} | Tot: ${formatEuro(r.totale)}`;
        doc.text(line);
        if (doc.y > 760) doc.addPage();
      }

      doc.end();
      return;
    }

    return res.status(400).json({ error: 'Formato non supportato (usa xlsx o pdf)' });
  } catch (err) {
    console.error('GET /report/iva/export:', err.details || err);
    res.status(500).json({ error: 'Errore export IVA' });
  }
});

module.exports = router;
