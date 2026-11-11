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


// La quota e il residuo sono del corsista, non del singolo corso.
// Chi frequenta più corsi compare in ciascun gruppo per agevolare i controlli
// dei docenti, ma NON deve essere sommato più volte nei totali economici.
export function groupUnpaidStudentsByCourse(unpaidRows = []) {
  const groups = new Map()
  const keyOf = (course) => {
    const id = String(course?.id || '').trim()
    const label = String(course?.nome || course?.name || '').trim()
    if (id) return 'id:' + id
    if (label) return 'name:' + label.toLocaleLowerCase('it-IT')
    return 'without-course'
  }

  for (const row of unpaidRows) {
    const courses = Array.isArray(row.corsi) && row.corsi.length ? row.corsi : [null]
    const rowCourseKeys = new Set()
    for (const course of courses) {
      const key = keyOf(course)
      if (rowCourseKeys.has(key)) continue
      rowCourseKeys.add(key)

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: String(course?.nome || course?.name || '').trim() || 'Senza corso associato',
          rows: [],
          studentIds: new Set(),
        })
      }
      const group = groups.get(key)
      const studentId = String(row.tesseramento_id || row.id || row.email || studentName(row))
      if (group.studentIds.has(studentId)) continue
      group.studentIds.add(studentId)
      group.rows.push(row)
    }
  }

  return [...groups.values()]
    .map(({ studentIds, ...group }) => ({
      ...group,
      rows: group.rows.sort((a, b) => studentName(a).localeCompare(studentName(b), 'it', { sensitivity: 'base' })),
    }))
    .sort((a, b) => {
      if (a.key === 'without-course') return 1
      if (b.key === 'without-course') return -1
      return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    })
}

export function exportUnpaidStudentsPdf({ month, rows = [] } = {}) {
  const unpaid = getUnpaidStudents(rows)
  if (!unpaid.length) return 0

  const groups = groupUnpaidStudentsByCourse(unpaid)
  // Totali calcolati SOLO dall'elenco unico dei corsisti e mai dalle sezioni.
  const courseTotal = unpaid.reduce((sum, row) => sum + courseBalanceDue(row), 0)
  const membershipTotal = unpaid.reduce((sum, row) => sum + membershipBalanceDue(row), 0)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const generated = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date())

  const drawPageHeader = (group) => {
    doc.setFillColor(35, 43, 67)
    doc.rect(0, 0, pageWidth, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.text('ORCHIDEA CLUB  /  NOVA', 12, 10)
    doc.setFontSize(9.5)
    doc.text('CONTROLLO NON PAGANTI PER CORSO - ' + displayMonth(month).toUpperCase(), 12, 18)

    doc.setTextColor(62, 73, 93)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(
      unpaid.length + ' corsisti unici  |  Residuo corsi: ' + money(courseTotal) + '  |  Tessere: ' + money(membershipTotal),
      12, 31,
    )
    doc.setFontSize(7.4)
    doc.text(
      'I multicorso compaiono in piu sezioni: gli importi sono del corsista e NON vanno sommati tra corsi.',
      12, 37,
    )

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const courseTitle = doc.splitTextToSize('CORSO: ' + group.name.toUpperCase(), pageWidth - 103).slice(0, 2)
    doc.text(courseTitle, 12, 46, { lineHeightFactor: 1.15 })
    doc.setFontSize(8.5)
    doc.text(group.rows.length + ' allievi da controllare', pageWidth - 12, 46, { align: 'right' })
  }

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) doc.addPage()
    const body = group.rows.map((row, index) => {
      const otherCourses = (row.corsi || []).filter((course) => {
        const courseId = String(course?.id || '').trim()
        const courseName = String(course?.nome || course?.name || '').trim()
        if (group.key === 'id:' + courseId && courseId) return false
        if (group.key === 'name:' + courseName.toLocaleLowerCase('it-IT') && courseName) return false
        return Boolean(courseName)
      })
      const uniqueOtherCourses = [...new Set(otherCourses.map((course) => course.nome || course.name))]
      return [
        String(index + 1),
        studentName(row) + (row.numero_tessera ? '\nTessera ' + row.numero_tessera : ''),
        uniqueOtherCourses.join(', ') || '—',
        String(row.tipo_pacchetto || row.formula || '—'),
        courseBalanceDue(row) > 0.009 ? money(courseBalanceDue(row)) : '—',
        membershipBalanceDue(row) > 0.009 ? money(membershipBalanceDue(row)) : '—',
        studentStatus(row),
        '',
        '',
      ]
    })

    autoTable(doc, {
      startY: 59,
      margin: { left: 12, right: 12, top: 59, bottom: 18 },
      head: [[
        'N.', 'ALLIEVO', 'ALTRI CORSI', 'PACCHETTO',
        'RESIDUO CORSI', 'TESSERA', 'STATO', 'PAGATO', 'NON PAGATO',
      ]],
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
        fillColor: [65, 54, 122],
        textColor: [255, 255, 255],
        fontSize: 7.3,
        fontStyle: 'bold',
        minCellHeight: 10,
      },
      alternateRowStyles: { fillColor: [247, 248, 251] },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 51, fontStyle: 'bold' },
        2: { cellWidth: 53 },
        3: { cellWidth: 39 },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 24 },
        7: { cellWidth: 23, halign: 'center' },
        8: { cellWidth: 23, halign: 'center' },
      },
      didDrawCell: ({ section, column, cell }) => {
        if (section !== 'body' || ![7, 8].includes(column.index)) return
        const x = cell.x + cell.width / 2 - 2.6
        const y = cell.y + cell.height / 2 - 2.6
        doc.setDrawColor(77, 85, 105)
        doc.setLineWidth(0.35)
        doc.rect(x, y, 5.2, 5.2)
      },
      didDrawPage: () => drawPageHeader(group),
    })
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(214, 219, 228)
    doc.line(12, pageHeight - 14, pageWidth - 12, pageHeight - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(93, 105, 125)
    doc.text('Estratto il ' + generated + '  |  Verifica manuale: le spunte non registrano pagamenti in Nova', 12, pageHeight - 9)
    doc.text('Pagina ' + page + ' / ' + totalPages, pageWidth - 12, pageHeight - 9, { align: 'right' })
  }

  doc.save('Nova_non_paganti_per_corso_' + String(month || 'mese') + '.pdf')
  return unpaid.length
}
