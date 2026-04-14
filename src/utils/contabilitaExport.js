import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { euro } from '../api/contabilita'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportRendicontoExcel({ periodLabel, rendiconto, iva }) {
  const wb = XLSX.utils.book_new()

  const summaryRows = [
    ['Periodo', periodLabel],
    [],
    ['Sezione', 'Entrate', 'Uscite', 'Saldo', 'Movimenti'],
    [
      'Istituzionale',
      Number(rendiconto.summary.istituzionale.totalIn || 0),
      Number(rendiconto.summary.istituzionale.totalOut || 0),
      Number(rendiconto.summary.istituzionale.saldo || 0),
      Number(rendiconto.summary.istituzionale.rowsCount || 0),
    ],
    [
      'Commerciale',
      Number(rendiconto.summary.commerciale.totalIn || 0),
      Number(rendiconto.summary.commerciale.totalOut || 0),
      Number(rendiconto.summary.commerciale.saldo || 0),
      Number(rendiconto.summary.commerciale.rowsCount || 0),
    ],
    [
      'Non classificate',
      Number(rendiconto.summary.nonClassificate.totalIn || 0),
      Number(rendiconto.summary.nonClassificate.totalOut || 0),
      Number(rendiconto.summary.nonClassificate.saldo || 0),
      Number(rendiconto.summary.nonClassificate.rowsCount || 0),
    ],
    [
      'Totale',
      Number(rendiconto.summary.totale.totalIn || 0),
      Number(rendiconto.summary.totale.totalOut || 0),
      Number(rendiconto.summary.totale.saldo || 0),
      Number(rendiconto.summary.totale.rowsCount || 0),
    ],
  ]

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Rendiconto')

  const detailRows = (rendiconto.rows || []).map((row) => ({
    Data: row.dateLabel || '',
    Descrizione: row.description || '',
    Natura: row.nature || '',
    Conto: row.account_code || '',
    Metodo: row.method || '',
    Centro: row.center || '',
    Entrata: Number(row.amount_in || 0),
    Uscita: Number(row.amount_out || 0),
    Saldo: Number((row.amount_in || 0) - (row.amount_out || 0)),
    IVA: Number(row.vat_amount || 0),
    LatoIVA: row.vat_side || '',
    Note: row.note || '',
    Fonte: row.source || '',
  }))

  const wsDetail = XLSX.utils.json_to_sheet(detailRows)
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Movimenti')

  const ivaRows = [
    { Periodo: periodLabel, Tipo: 'IVA a debito', Importo: Number(iva.vatDebit || 0) },
    { Periodo: periodLabel, Tipo: 'IVA a credito', Importo: Number(iva.vatCredit || 0) },
    { Periodo: periodLabel, Tipo: 'Saldo IVA', Importo: Number(iva.balance || 0) },
  ]

  const wsIva = XLSX.utils.json_to_sheet(ivaRows)
  XLSX.utils.book_append_sheet(wb, wsIva, 'IVA')

  XLSX.writeFile(wb, `rendiconto-asd-${periodLabel.replace(/\//g, '-')}.xlsx`)
}

export function exportIvaExcel({ periodLabel, scadenziario }) {
  const wb = XLSX.utils.book_new()

  const periodRows = (scadenziario.periods || []).map((item) => ({
    Periodo: item.label,
    IVADebito: Number(item.vatDebit || 0),
    IVACredito: Number(item.vatCredit || 0),
    Saldo: Number(item.balance || 0),
    Movimenti: Number(item.rows?.length || 0),
  }))

  const wsPeriods = XLSX.utils.json_to_sheet(periodRows)
  XLSX.utils.book_append_sheet(wb, wsPeriods, 'Scadenziario IVA')

  const detailRows = (scadenziario.periods || []).flatMap((item) =>
    (item.rows || []).map((row) => ({
      Periodo: item.label,
      Data: row.dateLabel || '',
      Descrizione: row.description || '',
      Conto: row.account_code || '',
      Natura: row.nature || '',
      IVA: Number(row.vat_amount || 0),
      LatoIVA: row.vat_side || '',
      Aliquota: Number(row.vat_rate || 0),
    }))
  )

  const wsDetail = XLSX.utils.json_to_sheet(detailRows)
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Dettaglio IVA')

  XLSX.writeFile(wb, `scadenziario-iva-${periodLabel.replace(/\//g, '-')}.xlsx`)
}

export function exportRendicontoPdf({ periodLabel, rendiconto, iva }) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('Rendiconto gestionale ASD', 14, 18)
  doc.setFontSize(11)
  doc.text(`Periodo: ${periodLabel}`, 14, 26)

  autoTable(doc, {
    startY: 34,
    head: [['Sezione', 'Entrate', 'Uscite', 'Saldo', 'Movimenti']],
    body: [
      [
        'Istituzionale',
        euro(rendiconto.summary.istituzionale.totalIn),
        euro(rendiconto.summary.istituzionale.totalOut),
        euro(rendiconto.summary.istituzionale.saldo),
        String(rendiconto.summary.istituzionale.rowsCount),
      ],
      [
        'Commerciale',
        euro(rendiconto.summary.commerciale.totalIn),
        euro(rendiconto.summary.commerciale.totalOut),
        euro(rendiconto.summary.commerciale.saldo),
        String(rendiconto.summary.commerciale.rowsCount),
      ],
      [
        'Non classificate',
        euro(rendiconto.summary.nonClassificate.totalIn),
        euro(rendiconto.summary.nonClassificate.totalOut),
        euro(rendiconto.summary.nonClassificate.saldo),
        String(rendiconto.summary.nonClassificate.rowsCount),
      ],
      [
        'Totale',
        euro(rendiconto.summary.totale.totalIn),
        euro(rendiconto.summary.totale.totalOut),
        euro(rendiconto.summary.totale.saldo),
        String(rendiconto.summary.totale.rowsCount),
      ],
    ],
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Riepilogo IVA', 'Importo']],
    body: [
      ['IVA a debito', euro(iva.vatDebit)],
      ['IVA a credito', euro(iva.vatCredit)],
      ['Saldo IVA', euro(iva.balance)],
    ],
  })

  doc.save(`rendiconto-asd-${periodLabel.replace(/\//g, '-')}.pdf`)
}

export function exportIvaPdf({ periodLabel, scadenziario }) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('Scadenziario IVA', 14, 18)
  doc.setFontSize(11)
  doc.text(`Periodo: ${periodLabel}`, 14, 26)

  autoTable(doc, {
    startY: 34,
    head: [['Periodo', 'IVA a debito', 'IVA a credito', 'Saldo', 'Movimenti']],
    body: (scadenziario.periods || []).map((item) => [
      item.label,
      euro(item.vatDebit),
      euro(item.vatCredit),
      euro(item.balance),
      String(item.rows?.length || 0),
    ]),
  })

  doc.save(`scadenziario-iva-${periodLabel.replace(/\//g, '-')}.pdf`)
}