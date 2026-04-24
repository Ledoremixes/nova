
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

function numberPlain(value) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function saveWorkbook(workbook, filename) {
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
}

function sectionLabel(code, isIncome) {
  const map = {
    A: isIncome ? 'A) Entrate da attività istituzionali' : 'A) Uscite da attività istituzionali',
    C: isIncome
      ? 'C) Entrate da attività di raccolta fondi e attività commerciali connesse'
      : 'C) Uscite da attività di raccolta fondi e attività commerciali connesse',
    D: isIncome ? 'D) Entrate da attività finanziarie e patrimoniali' : 'D) Uscite da attività finanziarie e patrimoniali',
    E: isIncome ? 'E) Entrate di supporto generale' : 'E) Uscite di supporto generale',
  }
  return map[code] || code
}

function buildStatementTableRows(rendiconto, side) {
  const currentLines = side === 'in' ? rendiconto.statement.in : rendiconto.statement.out
  const comparisonLines = side === 'in' ? rendiconto.comparison?.statement?.in || [] : rendiconto.comparison?.statement?.out || []
  const comparisonMap = comparisonLines.reduce((acc, line) => {
    acc[line.code] = Number(line.amount || 0)
    return acc
  }, {})

  const rows = []
  let currentSection = null

  for (const line of currentLines) {
    if (line.section !== currentSection) {
      currentSection = line.section
      rows.push([
        {
          content: sectionLabel(line.section, side === 'in'),
          colSpan: 4,
          styles: {
            fillColor: [47, 116, 181],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left',
          },
        },
      ])
    }

    rows.push([
      line.code,
      line.label,
      numberPlain(line.amount),
      numberPlain(comparisonMap[line.code] || 0),
    ])
  }

  return rows
}

function statementSectionTotal(lines, comparisonLines, sectionCode) {
  const current = (lines || [])
    .filter((line) => line.section === sectionCode)
    .reduce((acc, line) => acc + Number(line.amount || 0), 0)

  const comparison = (comparisonLines || [])
    .filter((line) => line.section === sectionCode)
    .reduce((acc, line) => acc + Number(line.amount || 0), 0)

  return { current, comparison }
}

function addStatementFooterRows(rows, rendiconto, side) {
  const currentLines = side === 'in' ? rendiconto.statement.in : rendiconto.statement.out
  const comparisonLines = side === 'in' ? rendiconto.comparison?.statement?.in || [] : rendiconto.comparison?.statement?.out || []

  for (const sectionCode of ['A', 'C', 'D', 'E']) {
    const total = statementSectionTotal(currentLines, comparisonLines, sectionCode)
    rows.push([
      '',
      `Totale sezione ${sectionCode}`,
      numberPlain(total.current),
      numberPlain(total.comparison),
    ])
  }

  const currentTotal =
    side === 'in'
      ? Number(rendiconto.summary?.totale?.totalIn || 0)
      : Number(rendiconto.summary?.totale?.totalOut || 0)

  const comparisonTotal =
    side === 'in'
      ? Number(rendiconto.comparison?.summary?.totale?.totalIn || 0)
      : Number(rendiconto.comparison?.summary?.totale?.totalOut || 0)

  rows.push([
    '',
    side === 'in' ? 'Totale entrate della gestione' : 'Totale uscite della gestione',
    numberPlain(currentTotal),
    numberPlain(comparisonTotal),
  ])

  return rows
}

function addHeader(doc, {
  title,
  organization = {},
  currentColumnLabel,
  comparisonColumnLabel,
  criteriaNote,
}) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text(organization.name || 'Associazione Sportiva Dilettantistica', 14, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const addressLines = [
    organization.address,
    organization.city,
    organization.email,
    organization.taxCode ? `C.F. ${organization.taxCode}` : null,
    organization.vatNumber ? `P.IVA ${organization.vatNumber}` : null,
  ].filter(Boolean)

  let y = 12
  for (const line of addressLines) {
    doc.text(line, 285, y, { align: 'right' })
    y += 4.4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 14, 32)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('(Importi in EUR)', 14, 38)
  doc.text(`Periodo corrente: ${currentColumnLabel}`, 14, 43)
  doc.text(`Periodo comparativo: ${comparisonColumnLabel}`, 14, 47)

  if (criteriaNote) {
    doc.setFontSize(8)
    doc.text(criteriaNote, 14, 52, { maxWidth: 270 })
  }
}

function addFinancialPosition(doc, startY, rendiconto) {
  const body = [
    ['ACIV', 'Cassa e banca', numberPlain(rendiconto.financialPosition?.current?.total || 0), numberPlain(rendiconto.financialPosition?.comparison?.total || 0)],
    ['ACIV3', 'Cassa', numberPlain(rendiconto.financialPosition?.current?.cashBalance || 0), numberPlain(rendiconto.financialPosition?.comparison?.cashBalance || 0)],
    ['ACIV1', 'Depositi bancari e postali', numberPlain(rendiconto.financialPosition?.current?.bankBalance || 0), numberPlain(rendiconto.financialPosition?.comparison?.bankBalance || 0)],
    ['ACIV4', 'Portafoglio e conto federale', numberPlain(rendiconto.financialPosition?.current?.portfolioBalance || 0), numberPlain(rendiconto.financialPosition?.comparison?.portfolioBalance || 0)],
  ]

  autoTable(doc, {
    startY,
    margin: { left: 14, right: 14 },
    tableWidth: 268,
    head: [['GR1', 'ATTIVO CIRCOLANTE', 'Corrente', 'Comparativo']],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [120, 120, 120],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [47, 116, 181],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 170 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'right', cellWidth: 40 },
    },
  })
}

export function exportRendicontoPdf({
  periodLabel,
  rendiconto,
  organization = {
    name: 'Associazione Sportiva Dilettantistica Nexum',
    address: 'Gradengio 10',
    city: '35131 Padova',
    email: 'info@example.com',
  },
}) {
  if (!rendiconto) return

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const currentColumnLabel = periodLabel || 'Periodo selezionato'
  const comparisonColumnLabel =
    rendiconto?.comparison?.fromDate && rendiconto?.comparison?.toDate
      ? `${rendiconto.comparison.fromDate} / ${rendiconto.comparison.toDate}`
      : 'Periodo comparativo'

  addHeader(doc, {
    title: 'RENDICONTO PER CASSA',
    organization,
    currentColumnLabel,
    comparisonColumnLabel,
    criteriaNote: rendiconto?.meta?.criteriaNote,
  })

  const outRows = addStatementFooterRows(buildStatementTableRows(rendiconto, 'out'), rendiconto, 'out')
  const inRows = addStatementFooterRows(buildStatementTableRows(rendiconto, 'in'), rendiconto, 'in')

  autoTable(doc, {
    startY: 58,
    margin: { left: 14 },
    tableWidth: 128,
    head: [['GR1', 'USCITE', currentColumnLabel, comparisonColumnLabel]],
    body: outRows,
    styles: {
      fontSize: 7.4,
      cellPadding: 1.35,
      lineColor: [120, 120, 120],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [47, 116, 181],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 76 },
      2: { cellWidth: 21, halign: 'right' },
      3: { cellWidth: 21, halign: 'right' },
    },
  })

  autoTable(doc, {
    startY: 58,
    margin: { left: 148 },
    tableWidth: 128,
    head: [['GR1', 'ENTRATE', currentColumnLabel, comparisonColumnLabel]],
    body: inRows,
    styles: {
      fontSize: 7.4,
      cellPadding: 1.35,
      lineColor: [120, 120, 120],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [47, 116, 181],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 76 },
      2: { cellWidth: 21, halign: 'right' },
      3: { cellWidth: 21, halign: 'right' },
    },
  })

  const nextY = Math.max(doc.lastAutoTable.finalY + 6, 190)
  addFinancialPosition(doc, nextY, rendiconto)

  doc.setFontSize(8)
  doc.text(
    'Documento gestionale predisposto sulla base delle registrazioni di prima nota e delle regole di riclassificazione adottate. Per usi civilistico-fiscali o istruttorie bancarie rilevanti è raccomandato il visto del consulente.',
    14,
    204,
    { maxWidth: 265 }
  )

  doc.save('rendiconto-per-cassa.pdf')
}

export function exportRendicontoExcel({ periodLabel, rendiconto }) {
  if (!rendiconto) return

  const summaryRows = [
    ['Periodo', periodLabel || 'Periodo selezionato'],
    ['Entrate istituzionali', Number(rendiconto.summary?.istituzionale?.totalIn || 0)],
    ['Uscite istituzionali', Number(rendiconto.summary?.istituzionale?.totalOut || 0)],
    ['Entrate commerciali', Number(rendiconto.summary?.commerciale?.totalIn || 0)],
    ['Uscite commerciali', Number(rendiconto.summary?.commerciale?.totalOut || 0)],
    ['Supporto generale - uscite', Number(rendiconto.summary?.supportoGenerale?.totalOut || 0)],
    ['Totale entrate', Number(rendiconto.summary?.totale?.totalIn || 0)],
    ['Totale uscite', Number(rendiconto.summary?.totale?.totalOut || 0)],
    ['Saldo', Number(rendiconto.summary?.totale?.saldo || 0)],
  ]

  const detailsRows = (rendiconto.rows || []).map((row) => ({
    Data: row.dateLabel,
    Descrizione: row.description,
    Entrata: Number(row.amount_in || 0),
    Uscita: Number(row.amount_out || 0),
    Conto: row.account_code || '',
    Metodo: row.method || '',
    Centro: row.center || '',
    Natura_origine: row.nature || '',
    Natura_report: row.report_bucket || '',
    Riga_report: row.report_line_code || '',
    Note: row.note || '',
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Sintesi')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailsRows), 'Dettaglio')
  saveWorkbook(wb, 'rendiconto-per-cassa.xlsx')
}

export function exportIvaPdf({ periodLabel, iva }) {
  if (!iva) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(18)
  doc.text('Riepilogo IVA', 14, 18)
  doc.setFontSize(10)
  doc.text(`Periodo: ${periodLabel || 'Periodo selezionato'}`, 14, 25)

  autoTable(doc, {
    startY: 34,
    head: [['Voce', 'Importo']],
    body: [
      ['IVA a debito', euro(iva.vatDebit)],
      ['IVA a credito', euro(iva.vatCredit)],
      ['Saldo IVA', euro(iva.balance)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [47, 116, 181] },
  })

  doc.save('iva-riepilogo.pdf')
}

export function exportIvaExcel({ periodLabel, iva, scadenziario }) {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Periodo', periodLabel || 'Periodo selezionato'],
      ['IVA a debito', Number(iva?.vatDebit || 0)],
      ['IVA a credito', Number(iva?.vatCredit || 0)],
      ['Saldo IVA', Number(iva?.balance || 0)],
    ]),
    'Sintesi IVA'
  )

  const periodRows = (scadenziario?.periods || []).map((row) => ({
    Periodo: row.label,
    IvaDebito: Number(row.vatDebit || 0),
    IvaCredito: Number(row.vatCredit || 0),
    Saldo: Number(row.balance || 0),
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(periodRows), 'Scadenziario IVA')
  saveWorkbook(wb, 'iva-riepilogo.xlsx')
}
