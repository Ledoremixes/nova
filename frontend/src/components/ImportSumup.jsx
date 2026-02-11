import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';

// 🔧 invece di usare Date/toISOString lavoriamo "a mano"
// ritorna { date: 'YYYY-MM-DD', datetime: 'YYYY-MM-DDTHH:MM:SS' }
function parseItalianDateTimeToStrings(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const [datePart, timePartRaw] = dateStr.split(',');
  if (!datePart) return null;

  const parts = datePart.trim().split(' ');
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const monthShort = parts[1].toLowerCase().slice(0, 3);
  const year = parseInt(parts[2], 10);

  const months = {
    gen: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    mag: 5,
    giu: 6,
    lug: 7,
    ago: 8,
    set: 9,
    ott: 10,
    nov: 11,
    dic: 12
  };

  const month = months[monthShort];
  if (!month || !day || !year) return null;

  let hours = 0;
  let minutes = 0;
  if (timePartRaw) {
    const timePart = timePartRaw.trim(); // es "20:26"
    const [h, m] = timePart.split(':');
    hours = parseInt(h, 10) || 0;
    minutes = parseInt(m, 10) || 0;
  }

  const pad = n => String(n).padStart(2, '0');

  const date = `${year}-${pad(month)}-${pad(day)}`;            // 2025-12-05
  const datetime = `${date}T${pad(hours)}:${pad(minutes)}:00`; // 2025-12-05T20:26:00

  return { date, datetime };
}

export default function ImportSumup({ token, onImported }) {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setInfo('');
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      const allEntries = [];

      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;

        const rows = XLSX.utils.sheet_to_json(sheet);
        const center = sheetName; // es: "VENERDI COUNTRY", "SABATO LATINO" o "Sheet0"

        rows.forEach(row => {
          const dataRaw = row['Data'];
          const tipo = row['Tipo'];
          const descrizione = row['Descrizione'];
          const lordo = row['Prezzo (lordo)'];
          const metodo = row['Metodo di pagamento'];
          const idTrans = row['ID Transazione'];

          // 🔹 Percentuale IVA (colonna M "Percentuale imposta")
          const vatRateRaw =
            row['Percentuale imposta'] ??
            row['Aliquota IVA'] ??
            row['IVA %'] ??
            row['IVA (%)'] ??
            null;

          let vatRate = null;
          if (
            vatRateRaw !== null &&
            vatRateRaw !== undefined &&
            vatRateRaw !== ''
          ) {
            // esempi:
            // 0.22        -> 22
            // "0,22"      -> 22
            // "22%"       -> 22
            // "22,00%"    -> 22
            const cleaned = String(vatRateRaw)
              .replace('%', '')
              .replace(',', '.')
              .trim();

            const parsedRate = Number(cleaned);
            if (!Number.isNaN(parsedRate)) {
              if (parsedRate > 0 && parsedRate <= 1) {
                // formato Excel 0.22 = 22%
                vatRate = parsedRate * 100;
              } else {
                vatRate = parsedRate;
              }
            }
          }

          // 🔹 Importo IVA (colonna L "IVA")
          const vatAmountRaw =
            row['IVA'] ??
            row['Imposta'] ??
            row['Importo IVA'] ??
            null;

          let vatAmount = null;
          if (
            vatAmountRaw !== null &&
            vatAmountRaw !== undefined &&
            vatAmountRaw !== ''
          ) {
            const cleaned = String(vatAmountRaw)
              .replace(',', '.')
              .trim();
            const parsedAmount = Number(cleaned);
            vatAmount = Number.isNaN(parsedAmount) ? null : parsedAmount;
          }

          const parsed = parseItalianDateTimeToStrings(String(dataRaw || ''));
          if (!parsed) return;

          const { date, datetime } = parsed;

          // scarta righe vuote, totali, o senza prezzo
          if (!descrizione || !lordo) return;
          // se c'è il campo Tipo e non è "Vendita", scarta
          if (tipo && tipo !== 'Vendita') return;

          allEntries.push({
            date,                      // solo data
            operation_datetime: datetime, // data + ora per i filtri
            description: descrizione,
            amountIn: Number(lordo),
            amountOut: 0,
            accountCode: null,
            method: metodo || null,
            center,
            note: idTrans ? `SumUp ${idTrans}` : null,
            nature: null,
            vatRate,
            vatAmount
          });
        });
      });

      if (allEntries.length === 0) {
        setError('Nessun movimento valido trovato nel file.');
        setLoading(false);
        return;
      }

      for (const entry of allEntries) {
        await api.createEntry(token, entry);
      }

      setInfo(`Importati ${allEntries.length} movimenti da SumUp.`);
      if (onImported) onImported();
    } catch (err) {
      console.error(err);
      setError(err.message || "Errore durante l'import da SumUp");
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="import-box">
      <label className="import-label">
        Importa da SumUp (.xlsx):
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          disabled={loading}
        />
      </label>
      {loading && <div className="import-info">Import in corso...</div>}
      {info && <div className="import-info">{info}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}