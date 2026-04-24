import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

function safeFileName(value) {
  return String(value || 'report')
    .replace(/[^\w\d-_]+/g, '_')
    .replace(/_+/g, '_')
}

export function exportRendicontoExcel({ periodLabel, rendiconto }) {
  if (!rendiconto) return

  const rows = []

  for (const section of rendiconto.sections || []) {
    rows.push([section.title, '', '', ''])
    rows.push(['Codice', 'Voce', 'Entrate', 'Uscite'])

    for (const item of section.rows || []) {
      rows.push([
        item.rowCode || '',
        item.label || '',
        item.totalIn || 0,
        item.totalOut || 0,
      ])
    }

    rows.push(['', 'Totale sezione', section.totalIn || 0, section.totalOut || 0])
    rows.push([])
  }

  rows.push(['', 'Totale entrate', rendiconto.summary?.totale?.totalIn || 0, ''])
  rows.push(['', 'Totale uscite', '', rendiconto.summary?.totale?.totalOut || 0])
  rows.push(['', 'Saldo', rendiconto.summary?.totale?.saldo || 0, ''])

  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rendiconto')
  XLSX.writeFile(workbook, `rendiconto_${safeFileName(periodLabel)}.xlsx`)
}

export function exportRendicontoPdf({ periodLabel, rendiconto }) {
  if (!rendiconto) return

  const doc = new jsPDF('p', 'mm', 'a4')
  let cursorY = 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Rendiconto gestionale ASD', 14, cursorY)

  cursorY += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Periodo: ${periodLabel}`, 14, cursorY)

  cursorY += 8
  doc.setFontSize(9)
  doc.text(
    'Prospetto generato dal gestionale sulla base della classificazione conti configurata in Conti > Contabilita.',
    14,
    cursorY
  )

  cursorY += 6

  for (const section of rendiconto.sections || []) {
    autoTable(doc, {
      startY: cursorY,
      head: [[section.title, '', '', '']],
      body: [
        ['Codice', 'Voce', 'Entrate', 'Uscite'],
        ...(section.rows || []).map((item) => [
          item.rowCode || '',
          item.label || '',
          item.totalIn ? euro(item.totalIn) : '',
          item.totalOut ? euro(item.totalOut) : '',
        ]),
        ['', 'Totale sezione', euro(section.totalIn || 0), euro(section.totalOut || 0)],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [47, 110, 171] },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 96 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
      },
    })

    cursorY = doc.lastAutoTable.finalY + 5
  }

  autoTable(doc, {
    startY: cursorY,
    head: [['Riepilogo finale', 'Valore']],
    body: [
      ['Totale entrate', euro(rendiconto.summary?.totale?.totalIn || 0)],
      ['Totale uscite', euro(rendiconto.summary?.totale?.totalOut || 0)],
      ['Saldo', euro(rendiconto.summary?.totale?.saldo || 0)],
      ['Movimenti da classificare', String(rendiconto.summary?.nonClassificate?.rowsCount || 0)],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [47, 110, 171] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 56, halign: 'right' },
    },
  })

  doc.save(`rendiconto_${safeFileName(periodLabel)}.pdf`)
}
