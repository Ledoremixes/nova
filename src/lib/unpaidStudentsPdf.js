import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Non segnare i gettoni come mensilita' insolute: sono lezioni singole.
// Le tessere da saldare restano evidenziate anche quando i corsi sono coperti.
export function courseBalanceDue(row) {
  if (['sospeso', 'omaggio', 'gettone'].includes(row.stato_pagamento)) return 0
  return Math.max(0, Number(row.residuo || 0))
}

export function membershipBalanceDue(row) {
  return Math.max(0, Number(row.membership_fee_remaining || 0))
}

function studentName(row) {
  const surnameFirst = [row.cognome, row.nome].filter(Boolean).join(' ').trim()
  return surnameFirst || String(row.nomeCompleto || 'Senza nome')
}

export function getUnpaidStudents(rows = []) {
  return (rows || [])
    .filter((row) => courseBalanceDue(row) > 0.009 || membershipBalanceDue(row) > 0.009)
    .sort((a, b) => studentName(a).localeCompare(studentName(b), 'it', { sensitivity: 'base' }))
}

function money(value) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0)) + ' €'
}

function displayMonth(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number)
  if (!year || !monthNumber) return String(month || '')
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1))
}

function studentStatus(row) {
  const due = courseBalanceDue(row)
  if (due <= 0.009) return 'Solo tessera'
  if (row.stato_pagamento === 'parziale') return 'Parziale'
  return 'Da pagare'
}

export function exportUnpaidStudentsPdf({ month, rows = [] } = {}) {
  const unpaid = getUnpaidStudents(rows)
  if (!unpaid.length) return 0

  const courseTotal = unpaid.reduce((sum, row) => sum + courseBalanceDue(row), 0)
  const membershipTotal = unpaid.reduce((sum, row) => sum + membershipBalanceDue(row), 0)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const now = new Date()
  const generated = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(now)

  const body = unpaid.map((row, index) => [
    String(index + 1),
    studentName(row) + (row.numero_tessera ? '\nTessera ' + row.numero_tessera : ''),
    (row.corsi || []).map((course) => course.nome || 'Corso').join(', ') || '-',
    String(row.tipo_pacchetto || row.formula || '-'),
    courseBalanceDue(row) > 0.009 ? money(courseBalanceDue(row)) : '-',
    membershipBalanceDue(row) > 0.009 ? money(membershipBalanceDue(row)) : '-',
    studentStatus(row),
    '',
    '',
  ])

  autoTable(doc, {
    startY: 43,
    margin: { left: 12, right: 12, top: 39, bottom: 18 },
    head: [['N.', 'ALLIEVO', 'CORSI', 'PACCHETTO', 'RESIDUO CORSI', 'TESSERA', 'STATO', 'PAGATO', 'NON PAGATO']],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3.1, right: 2.3, bottom: 3.1, left: 2.3 },
      minCellHeight: 11,
      valign: 'middle',
      lineColor: [223, 228, 236],
      lineWidth: 0.12,
      textColor: [30, 42, 60],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [34, 43, 65],
      textColor: [255, 255, 255],
      fontSize: 7.4,
      fontStyle: 'bold',
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: [247, 248, 251] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 50, fontStyle: 'bold' },
      2: { cellWidth: 56 },
      3: { cellWidth: 40 },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 25 },
      7: { cellWidth: 21, halign: 'center' },
      8: { cellWidth: 24, halign: 'center' },
    },
    didDrawCell: (cell) => {
      if (cell.section !== 'body' || ![7, 8].includes(cell.column.index)) return
      const x = cell.cell.x + cell.cell.width / 2 - 2.6
      const y = cell.cell.y + cell.cell.height / 2 - 2.6
      doc.setDrawColor(77, 85, 105)
      doc.setLineWidth(0.35)
      doc.rect(x, y, 5.2, 5.2)
    },
    didDrawPage: () => {
      doc.setFillColor(35, 43, 67)
      doc.rect(0, 0, pageWidth, 24, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12.5)
      doc.text('ORCHIDEA CLUB  /  NOVA', 12, 10)
      doc.setFontSize(9.5)
      doc.text('CONTROLLO QUOTE NON SALDATE - ' + displayMonth(month).toUpperCase(), 12, 18)

      doc.setTextColor(62, 73, 93)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.6)
      doc.text(unpaid.length + ' allievi da verificare    |    Corsi: ' + money(courseTotal) + '    |    Tessere: ' + money(membershipTotal), 12, 31)
      doc.setFontSize(7.5)
      doc.text('Spuntare una casella al controllo: le spunte su carta NON registrano incassi in Nova.', 12, 36)
    },
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(214, 219, 228)
    doc.line(12, pageHeight - 14, pageWidth - 12, pageHeight - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(93, 105, 125)
    doc.text('Estratto il ' + generated + '  |  Verifica manuale - dati riferiti al momento della stampa', 12, pageHeight - 9)
    doc.text('Pagina ' + page + ' / ' + totalPages, pageWidth - 12, pageHeight - 9, { align: 'right' })
  }

  doc.save('Nova_non_paganti_' + String(month || 'mese') + '.pdf')
  return unpaid.length
}
