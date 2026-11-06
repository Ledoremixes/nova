import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function nameForSorting(student) {
  return [student.cognome, student.nome].filter(Boolean).join(' ').trim()
    || String(student.nomeCompleto || 'Corsista')
}

export function getMissingMedicalStudents(activeStudents = [], visits = []) {
  const withDocument = new Set(
    (visits || [])
      .filter((visit) => Boolean(String(visit.file_path || '').trim()))
      .map((visit) => String(visit.tesseramento_id || ''))
      .filter(Boolean),
  )
  const ids = new Set()
  return (activeStudents || [])
    .filter((student) => {
      const id = String(student.id || '')
      if (!id || ids.has(id) || withDocument.has(id)) return false
      ids.add(id)
      return true
    })
    .sort((a, b) => nameForSorting(a).localeCompare(nameForSorting(b), 'it', { sensitivity: 'base' }))
}

function displayMonth(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number)
  if (!year || !monthNumber) return month || ''
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1))
}

export function exportMissingMedicalVisitsPdf({ students = [], month } = {}) {
  if (!students.length) return 0

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  const createdAt = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date())

  autoTable(pdf, {
    startY: 41,
    margin: { left: 12, right: 12, top: 40, bottom: 18 },
    theme: 'grid',
    head: [['N.', 'CORSISTA', 'CORSI ATTIVI', 'TELEFONO', 'EMAIL', 'SOLLECITATO', 'CONSEGNATO']],
    body: students.map((student, index) => [
      String(index + 1),
      nameForSorting(student),
      (student.corsi || []).join(', ') || '—',
      student.telefono || '—',
      student.email || '—',
      '',
      '',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3.2, right: 2.3, bottom: 3.2, left: 2.3 },
      minCellHeight: 12,
      valign: 'middle',
      lineColor: [223, 228, 236],
      lineWidth: 0.14,
      textColor: [31, 41, 55],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [50, 39, 115],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: [249, 247, 255] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50, fontStyle: 'bold' },
      2: { cellWidth: 66 },
      3: { cellWidth: 31 },
      4: { cellWidth: 64 },
      5: { cellWidth: 25, halign: 'center' },
      6: { cellWidth: 27, halign: 'center' },
    },
    didDrawCell: ({ section, column, cell }) => {
      if (section !== 'body' || ![5, 6].includes(column.index)) return
      const side = 5
      const x = cell.x + (cell.width - side) / 2
      const y = cell.y + (cell.height - side) / 2
      pdf.setLineWidth(0.35)
      pdf.setDrawColor(74, 81, 104)
      pdf.rect(x, y, side, side)
    },
    didDrawPage: () => {
      pdf.setFillColor(49, 39, 111)
      pdf.rect(0, 0, width, 25, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text('ORCHIDEA CLUB  /  NOVA', 12, 10)
      pdf.setFontSize(9.5)
      pdf.text('CERTIFICATI MEDICI NON PRESENTI', 12, 18)

      pdf.setTextColor(55, 65, 81)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text('Corsisti con iscrizione attiva - ' + displayMonth(month), 12, 32)
      pdf.text(students.length + ' persone da sollecitare', width - 12, 32, { align: 'right' })
      pdf.setFontSize(7.5)
      pdf.text('Elenco amministrativo: nessun documento caricato in Nova. Le spunte su carta non aggiornano il gestionale.', 12, 37)
    },
  })

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    pdf.setDrawColor(218, 222, 230)
    pdf.line(12, height - 14, width - 12, height - 14)
    pdf.setTextColor(98, 105, 122)
    pdf.setFontSize(7.5)
    pdf.text('Generato il ' + createdAt + ' - riservato alla segreteria', 12, height - 9)
    pdf.text('Pagina ' + page + ' / ' + pageCount, width - 12, height - 9, { align: 'right' })
  }

  pdf.save('Nova_visite_mediche_non_presenti_' + month + '.pdf')
  return students.length
}
