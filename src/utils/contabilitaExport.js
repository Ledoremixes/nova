gitimport * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import dayjs from 'dayjs'

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

function safeFileName(value) {
  return String(value || 'report')
    .replace(/[^\w\d-_]+/g, '_')
    .replace(/_+/g, '_')
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

function sectionCodeFromBucket(value) {
  const code = String(value || '').trim().toUpperCase()

  if (code.startsWith('A_')) return 'A'
  if (code.startsWith('B_')) return 'B'
  if (code.startsWith('C_')) return 'C'
  if (code.startsWith('D_')) return 'D'
  if (code.startsWith('E_')) return 'E'
  if (code.startsWith('Z_')) return 'Z'

  return code || 'Z'
}

function bucketSide(value) {
  const code = String(value || '').trim().toUpperCase()

  if (code.includes('_ENTRATE_')) return 'in'
  if (code.includes('_USCITE_')) return 'out'

  return 'mixed'
}

function sectionLabel(code, isIncome) {
  const normalizedCode = sectionCodeFromBucket(code)

  const map = {
    A: isIncome
      ? 'A) Entrate da attività istituzionali'
      : 'A) Uscite da attività istituzionali',
    B: isIncome
      ? 'B) Entrate da attività secondarie e strumentali'
      : 'B) Uscite da attività secondarie e strumentali',
    C: isIncome
      ? 'C) Entrate da attività di raccolta fondi e attività commerciali connesse'
      : 'C) Uscite da attività di raccolta fondi e attività commerciali connesse',
    D: isIncome
      ? 'D) Entrate da attività finanziarie e patrimoniali'
      : 'D) Uscite da attività finanziarie e patrimoniali',
    E: isIncome
      ? 'E) Entrate di supporto generale'
      : 'E) Uscite di supporto generale',
    E: isIncome ? 'E) Entrate di supporto generale' : 'E) Uscite di supporto generale',
    Z: 'Z) Voci da classificare',
  }

  return map[normalizedCode] || normalizedCode
}

function normalizeStatementSide(rendiconto, side) {
  const fallbackSections = rendiconto?.sections || []
  const wantsIncome = side === 'in'

  if (rendiconto?.statement?.[side]?.length) {
    return rendiconto.statement[side].map((line) => ({
      ...line,
      section: sectionCodeFromBucket(line.section),
    }))
  }

  const rows = []

  for (const section of fallbackSections) {
    const currentBucket = section.sectionCode || section.code || ''
    const currentSide = section.side || bucketSide(currentBucket)

    // FIX: nella tabella USCITE non entrano bucket ENTRATE e viceversa.
    // Le voci mixed/da classificare entrano solo se hanno importo coerente col lato.
    if (currentSide !== side && currentSide !== 'mixed') continue

    for (const item of section.rows || []) {
      const amount = wantsIncome
        ? Number(item.totalIn || 0)
        : Number(item.totalOut || 0)

      if (amount === 0) continue

      rows.push({
        section: sectionCodeFromBucket(currentBucket),
        code: item.rowCode || '',
        label: item.label || '',
        amount,
      })
    }
  }

  return rows
}

function buildStatementTableRows(rendiconto, side) {
  const currentLines = normalizeStatementSide(rendiconto, side)
  const comparisonLines = rendiconto?.comparison?.statement?.[side] || []

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
      line.code || '',
      line.label || '',
      numberPlain(line.amount || 0),
      numberPlain(comparisonMap[line.code] || 0),
    ])
  }

  return rows
}

function statementSectionTotal(lines, comparisonLines, sectionCode) {
  const normalizedSection = sectionCodeFromBucket(sectionCode)

  const current = (lines || [])
    .filter((line) => sectionCodeFromBucket(line.section) === normalizedSection)
    .reduce((acc, line) => acc + Number(line.amount || 0), 0)

  const comparison = (comparisonLines || [])
    .filter((line) => sectionCodeFromBucket(line.section) === normalizedSection)
    .reduce((acc, line) => acc + Number(line.amount || 0), 0)

  return { current, comparison }
}

function addStatementFooterRows(rows, rendiconto, side) {
  const currentLines = normalizeStatementSide(rendiconto, side)
  const comparisonLines = rendiconto?.comparison?.statement?.[side] || []

  for (const sectionCode of ['A', 'B', 'C', 'D', 'E']) {
    const total = statementSectionTotal(currentLines, comparisonLines, sectionCode)

    if (total.current !== 0 || total.comparison !== 0) {
      rows.push([
        '',
        `Totale sezione ${sectionCode}`,
        numberPlain(total.current),
        numberPlain(total.comparison),
      ])
    }
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
    side === 'in'
      ? 'Totale entrate della gestione'
      : 'Totale uscite della gestione',
    numberPlain(currentTotal),
    numberPlain(comparisonTotal),
  ])

  return rows
}

function addHeader(
  doc,
  {
    title,
    organization = {},
    currentColumnLabel,
    comparisonColumnLabel,
    criteriaNote,
  }
) {
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
    [
      'ACIV',
      'Cassa e banca',
      numberPlain(rendiconto.financialPosition?.current?.total || 0),
      numberPlain(rendiconto.financialPosition?.comparison?.total || 0),
    ],
    [
      'ACIV3',
      'Cassa',
      numberPlain(rendiconto.financialPosition?.current?.cashBalance || 0),
      numberPlain(rendiconto.financialPosition?.comparison?.cashBalance || 0),
    ],
    [
      'ACIV1',
      'Depositi bancari e postali',
      numberPlain(rendiconto.financialPosition?.current?.bankBalance || 0),
      numberPlain(rendiconto.financialPosition?.comparison?.bankBalance || 0),
    ],
    [
      'ACIV4',
      'Portafoglio e conto federale',
      numberPlain(rendiconto.financialPosition?.current?.portfolioBalance || 0),
      numberPlain(rendiconto.financialPosition?.comparison?.portfolioBalance || 0),
    ],
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
    name: 'Club Orchidea ASD',
    address: 'Via Giuseppe Ungaretti 34',
    city: '21047 Saronno (VA)',
    email: 'info@orchideaclub.it',
    vatNumber: '14275140961',
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
    criteriaNote:
      rendiconto?.meta?.criteriaNote ||
      'Documento gestionale predisposto sulla base delle registrazioni di prima nota e delle regole di riclassificazione adottate.',
  })

  const outRows = addStatementFooterRows(
    buildStatementTableRows(rendiconto, 'out'),
    rendiconto,
    'out'
  )

  const inRows = addStatementFooterRows(
    buildStatementTableRows(rendiconto, 'in'),
    rendiconto,
    'in'
  )

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

  const finalLeftY = doc.lastAutoTable?.finalY || 160
  const nextY = Math.max(finalLeftY + 6, 190)

  addFinancialPosition(doc, nextY, rendiconto)

  doc.setFontSize(8)
  doc.text(
    'Documento gestionale predisposto sulla base delle registrazioni di prima nota e delle regole di riclassificazione adottate. Per usi civilistico-fiscali o istruttorie bancarie rilevanti è raccomandato il visto del consulente.',
    14,
    204,
    { maxWidth: 265 }
  )

  doc.save(`rendiconto_${safeFileName(periodLabel || 'periodo')}.pdf`)
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

  saveWorkbook(wb, `rendiconto_${safeFileName(periodLabel || 'periodo')}.xlsx`)
}

function getExportTotals({ iva, scadenziario }) {
  const totals = scadenziario?.totals || {}

  return {
    vatDebit: Number(totals.vatDebit ?? iva?.vatDebit ?? 0),
    vatCredit: Number(totals.vatCredit ?? iva?.vatCredit ?? 0),
    balance: Number(totals.balance ?? iva?.balance ?? 0),
    grossCommercialIncome: Number(
      totals.grossCommercialIncome ?? iva?.grossCommercialIncome ?? 0
    ),
    taxableCommercialIncome: Number(
      totals.taxableCommercialIncome ?? iva?.taxableCommercialIncome ?? 0
    ),
    commercialRowsCount: Number(
      totals.commercialRowsCount ?? iva?.commercialRows?.length ?? iva?.rows?.length ?? 0
    ),
  }
}

function monthNameFromNumber(monthNumber) {
  const months = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ]

  return months[monthNumber - 1] || ''
}

function safeNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function getRowReferenceDate(row) {
  return row?.reference_date || row?.date || row?.operation_datetime || null
}

function monthKeyFromDate(value) {
  const date = dayjs(value)

  if (!date.isValid()) return 'senza-data'

  return `${date.year()}-${String(date.month() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key) {
  if (key === 'senza-data') return 'Senza data'

  const [year, month] = String(key).split('-')
  return `${monthNameFromNumber(Number(month))} ${year}`
}

function typeLabelFromRow(row) {
  return row?.commercial_type_label || row?.commercialTypeLabel || 'Altre entrate commerciali'
}

function typeKeyFromRow(row) {
  return row?.commercial_type_key || row?.commercialTypeKey || 'altre_entrate_commerciali'
}

function grossFromRow(row) {
  return safeNumber(row?.amount_in)
}

function vatDebitFromRow(row) {
  return safeNumber(row?.commercial_vat_amount ?? row?.vat_amount)
}

function taxableFromRow(row) {
  const explicitTaxable = row?.commercial_taxable_amount

  if (explicitTaxable !== undefined && explicitTaxable !== null) {
    return safeNumber(explicitTaxable)
  }

  return Math.max(grossFromRow(row) - vatDebitFromRow(row), 0)
}

function makeEmptyExportAggregate({ key, label }) {
  return {
    key,
    label,
    grossCommercialIncome: 0,
    taxableCommercialIncome: 0,
    vatDebit: 0,
    vatCredit: 0,
    balance: 0,
    commercialRowsCount: 0,
    rows: [],
    types: [],
    _typeMap: new Map(),
  }
}

function addRowToExportAggregate(target, row) {
  const gross = grossFromRow(row)
  const vatDebit = vatDebitFromRow(row)
  const taxable = taxableFromRow(row)
  const typeKey = typeKeyFromRow(row)
  const typeLabel = typeLabelFromRow(row)

  target.grossCommercialIncome += gross
  target.taxableCommercialIncome += taxable
  target.vatDebit += vatDebit
  target.balance = target.vatDebit - target.vatCredit
  target.commercialRowsCount += 1
  target.rows.push(row)

  if (!target._typeMap) target._typeMap = new Map()

  if (!target._typeMap.has(typeKey)) {
    const item = makeEmptyExportAggregate({ key: typeKey, label: typeLabel })
    target._typeMap.set(typeKey, item)
    target.types.push(item)
  }

  const typeTarget = target._typeMap.get(typeKey)
  typeTarget.grossCommercialIncome += gross
  typeTarget.taxableCommercialIncome += taxable
  typeTarget.vatDebit += vatDebit
  typeTarget.balance = typeTarget.vatDebit - typeTarget.vatCredit
  typeTarget.commercialRowsCount += 1
  typeTarget.rows.push(row)
}

function cleanupExportAggregate(target) {
  target.balance = target.vatDebit - target.vatCredit
  target.types = (target.types || []).sort((a, b) => a.label.localeCompare(b.label))
  delete target._typeMap
  return target
}

function buildMonthsFromRows(rows) {
  const map = new Map()

  for (const row of rows || []) {
    const monthKey = monthKeyFromDate(getRowReferenceDate(row))

    if (!map.has(monthKey)) {
      map.set(
        monthKey,
        makeEmptyExportAggregate({
          key: monthKey,
          label: monthLabelFromKey(monthKey),
        })
      )
    }

    addRowToExportAggregate(map.get(monthKey), row)
  }

  return Array.from(map.values())
    .map(cleanupExportAggregate)
    .sort((a, b) => a.key.localeCompare(b.key))
}

function normalizeExportPeriods({ iva, scadenziario }) {
  if (scadenziario?.periods?.length) {
    return scadenziario.periods.map((period) => ({
      ...period,
      months:
        period.months?.length > 0
          ? period.months
          : buildMonthsFromRows(period.rows || []),
      grossCommercialIncome: safeNumber(period.grossCommercialIncome),
      taxableCommercialIncome: safeNumber(period.taxableCommercialIncome),
      vatDebit: safeNumber(period.vatDebit),
      vatCredit: safeNumber(period.vatCredit),
      balance: safeNumber(period.balance),
      commercialRowsCount: safeNumber(period.commercialRowsCount ?? period.rows?.length),
      types:
        period.types?.length > 0
          ? period.types
          : cleanupExportAggregate(
              (period.rows || []).reduce(
                (acc, row) => {
                  addRowToExportAggregate(acc, row)
                  return acc
                },
                makeEmptyExportAggregate({
                  key: period.key || 'periodo',
                  label: period.label || 'Periodo',
                })
              )
            ).types,
    }))
  }

  const rows = iva?.commercialRows || iva?.rows || []

  return [
    {
      key: 'periodo',
      label: 'Periodo selezionato',
      months: buildMonthsFromRows(rows),
      rows,
      types: cleanupExportAggregate(
        rows.reduce(
          (acc, row) => {
            addRowToExportAggregate(acc, row)
            return acc
          },
          makeEmptyExportAggregate({ key: 'periodo', label: 'Periodo selezionato' })
        )
      ).types,
      grossCommercialIncome: rows.reduce((acc, row) => acc + grossFromRow(row), 0),
      taxableCommercialIncome: rows.reduce((acc, row) => acc + taxableFromRow(row), 0),
      vatDebit: rows.reduce((acc, row) => acc + vatDebitFromRow(row), 0),
      vatCredit: safeNumber(iva?.vatCredit),
      balance: safeNumber(iva?.balance),
      commercialRowsCount: rows.length,
    },
  ]
}

function addPdfFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages()

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    doc.setDrawColor(220, 226, 235)
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(110, 118, 130)
    doc.text(`Generato il ${dayjs().format('DD/MM/YYYY HH:mm')}`, 14, pageHeight - 8)
    doc.text(`Pagina ${page} di ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    })
  }

  doc.setTextColor(0, 0, 0)
}

function addIvaReportHeader(doc, { periodLabel, organization }) {
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFillColor(20, 35, 60)
  doc.rect(0, 0, pageWidth, 42, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text('Comunicazione entrate commerciali e IVA', 14, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(225, 231, 240)
  doc.text(`Periodo: ${periodLabel || 'Periodo selezionato'}`, 14, 25)
  doc.text('Dettaglio mensile e per tipologia per predisposizione registro IVA / F24', 14, 32)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(organization?.name || 'Club Orchidea ASD', pageWidth - 14, 14, {
    align: 'right',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  const orgLines = [
    organization?.address,
    organization?.city,
    organization?.email,
    organization?.vatNumber ? `P.IVA ${organization.vatNumber}` : null,
  ].filter(Boolean)

  let y = 20

  for (const line of orgLines.slice(0, 4)) {
    doc.text(line, pageWidth - 14, y, { align: 'right' })
    y += 4
  }

  doc.setTextColor(0, 0, 0)
}

function addSummaryCards(doc, { totals, startY }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const gap = 4
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4
  const cardHeight = 22

  const cards = [
    {
      label: 'Entrate commerciali',
      value: euro(totals.grossCommercialIncome),
      fill: [239, 246, 255],
      border: [59, 130, 246],
      text: [30, 64, 175],
    },
    {
      label: 'Imponibile stimato',
      value: euro(totals.taxableCommercialIncome),
      fill: [240, 253, 244],
      border: [34, 197, 94],
      text: [22, 101, 52],
    },
    {
      label: 'IVA a debito',
      value: euro(totals.vatDebit),
      fill: [255, 241, 242],
      border: [244, 63, 94],
      text: [155, 23, 38],
    },
    {
      label: 'Saldo IVA',
      value: euro(totals.balance),
      fill: [245, 243, 255],
      border: [139, 92, 246],
      text: [91, 33, 182],
    },
  ]

  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + gap)

    doc.setFillColor(...card.fill)
    doc.setDrawColor(...card.border)
    doc.roundedRect(x, startY, cardWidth, cardHeight, 3, 3, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.3)
    doc.setTextColor(90, 95, 105)
    doc.text(card.label, x + 4, startY + 8)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...card.text)
    doc.text(card.value, x + 4, startY + 17)
  })

  doc.setTextColor(0, 0, 0)

  return startY + cardHeight + 10
}

function ensurePdfSpace(doc, currentY, neededHeight = 40) {
  const pageHeight = doc.internal.pageSize.getHeight()

  if (currentY + neededHeight > pageHeight - 24) {
    doc.addPage()
    return 18
  }

  return currentY
}

function addSectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(20, 35, 60)
  doc.text(title, 14, y)

  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.35)
  doc.line(14, y + 3, 196, y + 3)

  doc.setTextColor(0, 0, 0)

  return y + 8
}

function buildMonthlySummaryRows(periods) {
  const rows = []

  for (const period of periods || []) {
    for (const month of period.months || []) {
      rows.push([
        month.label,
        euro(month.grossCommercialIncome),
        euro(month.taxableCommercialIncome),
        euro(month.vatDebit),
        euro(month.vatCredit),
        euro(month.balance),
        String(month.commercialRowsCount || 0),
      ])
    }
  }

  return rows
}

function buildTypeTotals(periods) {
  const map = new Map()

  for (const period of periods || []) {
    for (const type of period.types || []) {
      if (!map.has(type.key)) {
        map.set(type.key, {
          key: type.key,
          label: type.label,
          grossCommercialIncome: 0,
          taxableCommercialIncome: 0,
          vatDebit: 0,
          vatCredit: 0,
          balance: 0,
          commercialRowsCount: 0,
        })
      }

      const item = map.get(type.key)
      item.grossCommercialIncome += safeNumber(type.grossCommercialIncome)
      item.taxableCommercialIncome += safeNumber(type.taxableCommercialIncome)
      item.vatDebit += safeNumber(type.vatDebit)
      item.vatCredit += safeNumber(type.vatCredit)
      item.balance = item.vatDebit - item.vatCredit
      item.commercialRowsCount += safeNumber(type.commercialRowsCount)
    }
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

export function exportIvaPdf({
  periodLabel,
  iva,
  scadenziario,
  organization = {
    name: 'Club Orchidea ASD',
    address: 'Via Giuseppe Ungaretti 34',
    city: '21047 Saronno (VA)',
    email: 'info@orchideaclub.it',
    vatNumber: '14275140961',
  },
}) {
  const periods = normalizeExportPeriods({ iva, scadenziario })
  const totals = getExportTotals({ iva, scadenziario })

  if (!periods.length && !iva && !scadenziario) return

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  addIvaReportHeader(doc, { periodLabel, organization })

  let y = 52

  y = addSummaryCards(doc, { totals, startY: y })

  y = addSectionTitle(doc, 'Riepilogo mensile delle entrate commerciali', y)

  const monthlyRows = buildMonthlySummaryRows(periods)

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [[
      'Mese',
      'Entrate commerciali',
      'Imponibile stimato',
      'IVA debito',
      'IVA credito',
      'Saldo IVA',
      'Mov.',
    ]],
    body:
      monthlyRows.length > 0
        ? monthlyRows
        : [['Nessun mese', euro(0), euro(0), euro(0), euro(0), euro(0), '0']],
    foot: [[
      'Totale periodo',
      euro(totals.grossCommercialIncome),
      euro(totals.taxableCommercialIncome),
      euro(totals.vatDebit),
      euro(totals.vatCredit),
      euro(totals.balance),
      String(totals.commercialRowsCount || 0),
    ]],
    styles: {
      fontSize: 7.5,
      cellPadding: 1.7,
      lineColor: [220, 226, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [20, 35, 60],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [229, 236, 246],
      textColor: [20, 35, 60],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center' },
    },
  })

  y = (doc.lastAutoTable?.finalY || y) + 12
  y = ensurePdfSpace(doc, y, 50)
  y = addSectionTitle(doc, 'Totale trimestre diviso per tipologia', y)

  const typeTotals = buildTypeTotals(periods)

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [['Tipologia', 'Entrate commerciali', 'Imponibile stimato', 'IVA debito', 'Movimenti']],
    body:
      typeTotals.length > 0
        ? typeTotals.map((type) => [
            type.label,
            euro(type.grossCommercialIncome),
            euro(type.taxableCommercialIncome),
            euro(type.vatDebit),
            String(type.commercialRowsCount || 0),
          ])
        : [['Nessuna entrata commerciale', euro(0), euro(0), euro(0), '0']],
    foot: [[
      'Totale trimestre',
      euro(totals.grossCommercialIncome),
      euro(totals.taxableCommercialIncome),
      euro(totals.vatDebit),
      String(totals.commercialRowsCount || 0),
    ]],
    styles: {
      fontSize: 8.2,
      cellPadding: 2,
      lineColor: [220, 226, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [47, 116, 181],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [232, 240, 254],
      textColor: [20, 35, 60],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
    },
  })

  y = (doc.lastAutoTable?.finalY || y) + 12

  for (const period of periods) {
    for (const month of period.months || []) {
      y = ensurePdfSpace(doc, y, 48)
      y = addSectionTitle(doc, `${month.label} - dettaglio per tipo`, y)

      const typeRows = month.types || []

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Tipologia', 'Entrate commerciali', 'Imponibile stimato', 'IVA debito', 'Movimenti']],
        body:
          typeRows.length > 0
            ? typeRows.map((type) => [
                type.label,
                euro(type.grossCommercialIncome),
                euro(type.taxableCommercialIncome),
                euro(type.vatDebit),
                String(type.commercialRowsCount || 0),
              ])
            : [['Nessuna entrata commerciale', euro(0), euro(0), euro(0), '0']],
        foot: [[
          `Totale ${month.label}`,
          euro(month.grossCommercialIncome),
          euro(month.taxableCommercialIncome),
          euro(month.vatDebit),
          String(month.commercialRowsCount || 0),
        ]],
        styles: {
          fontSize: 8,
          cellPadding: 1.9,
          lineColor: [220, 226, 235],
          lineWidth: 0.15,
        },
        headStyles: {
          fillColor: [47, 116, 181],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        footStyles: {
          fillColor: [232, 240, 254],
          textColor: [20, 35, 60],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'center' },
        },
      })

      y = (doc.lastAutoTable?.finalY || y) + 10
    }
  }

  y = ensurePdfSpace(doc, y, 36)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(220, 226, 235)
  doc.roundedRect(14, y, 182, 28, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(20, 35, 60)
  doc.text('Nota per il consulente', 20, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(70, 75, 85)
  doc.text(
    'Report generato dalle registrazioni di prima nota classificate come entrate commerciali. Le entrate sono divise per mese e tipologia, come richiesto per la predisposizione del registro IVA e del modello F24.',
    20,
    y + 15,
    { maxWidth: 168 }
  )

  doc.setTextColor(0, 0, 0)
  addPdfFooter(doc)

  doc.save(`iva_entrate_commerciali_${safeFileName(periodLabel || 'periodo')}.pdf`)
}

export function exportIvaExcel({ periodLabel, iva, scadenziario }) {
  const periods = normalizeExportPeriods({ iva, scadenziario })
  const totals = getExportTotals({ iva, scadenziario })
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Periodo', periodLabel || 'Periodo selezionato'],
      ['Entrate commerciali', Number(totals.grossCommercialIncome || 0)],
      ['Imponibile stimato', Number(totals.taxableCommercialIncome || 0)],
      ['IVA a debito', Number(totals.vatDebit || 0)],
      ['IVA a credito', Number(totals.vatCredit || 0)],
      ['Saldo IVA', Number(totals.balance || 0)],
      ['Movimenti commerciali', Number(totals.commercialRowsCount || 0)],
    ]),
    'Sintesi IVA'
  )

  const monthlyRows = []

  for (const period of periods || []) {
    for (const month of period.months || []) {
      monthlyRows.push({
        Periodo: period.label || period.key || '',
        Mese: month.label,
        EntrateCommerciali: Number(month.grossCommercialIncome || 0),
        ImponibileStimato: Number(month.taxableCommercialIncome || 0),
        IvaDebito: Number(month.vatDebit || 0),
        IvaCredito: Number(month.vatCredit || 0),
        SaldoIva: Number(month.balance || 0),
        Movimenti: Number(month.commercialRowsCount || 0),
      })
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(monthlyRows),
    'Riepilogo mensile'
  )

  const typeRows = []

  for (const type of buildTypeTotals(periods)) {
    typeRows.push({
      Tipologia: type.label,
      EntrateCommerciali: Number(type.grossCommercialIncome || 0),
      ImponibileStimato: Number(type.taxableCommercialIncome || 0),
      IvaDebito: Number(type.vatDebit || 0),
      Movimenti: Number(type.commercialRowsCount || 0),
    })
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(typeRows),
    'Totale per tipo'
  )

  const monthlyTypeRows = []

  for (const period of periods || []) {
    for (const month of period.months || []) {
      for (const type of month.types || []) {
        monthlyTypeRows.push({
          Periodo: period.label || period.key || '',
          Mese: month.label,
          Tipologia: type.label,
          EntrateCommerciali: Number(type.grossCommercialIncome || 0),
          ImponibileStimato: Number(type.taxableCommercialIncome || 0),
          IvaDebito: Number(type.vatDebit || 0),
          Movimenti: Number(type.commercialRowsCount || 0),
        })
      }
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(monthlyTypeRows),
    'Mese per tipo'
  )

  saveWorkbook(wb, `iva_entrate_commerciali_${safeFileName(periodLabel || 'periodo')}.xlsx`)
}