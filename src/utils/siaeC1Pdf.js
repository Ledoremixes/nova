import { jsPDF } from 'jspdf'

// Il modello grafico fornito dall'utente deriva da un A4 orizzontale
// di 842,25 x 595,50 pt. Le coordinate sottostanti sono quelle del
// modello originale: in questo modo i dati variabili cadono esattamente
// sulle righe e nelle celle previste, senza ridisegnare il modulo.
const SOURCE_PAGE_WIDTH_PT = 842.25
const SOURCE_PAGE_HEIGHT_PT = 595.5
const PAGE_WIDTH_MM = 297
const PAGE_HEIGHT_MM = 210
const DEFAULT_FONT_SIZE_PT = 8.4

let templatePromise = null

function ptX(value) {
  return Number(value) * (PAGE_WIDTH_MM / SOURCE_PAGE_WIDTH_PT)
}

function ptY(value) {
  return Number(value) * (PAGE_HEIGHT_MM / SOURCE_PAGE_HEIGHT_PT)
}

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(value)
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value || 0))
}

function safeFilename(value) {
  return String(value || 'Modelli_C1')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function monthLabel(value) {
  const [year, month] = String(value || '').split('-')
  if (!year || !month) return 'periodo'
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

async function fetchAsDataUrl(src) {
  if (String(src || '').startsWith('data:')) return src
  const response = await fetch(src)
  if (!response.ok) throw new Error('Impossibile caricare il modello ufficiale C1.')
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function loadTemplate(src = '/siae-c1-template.png') {
  if (String(src).startsWith('data:')) return fetchAsDataUrl(src)
  if (!templatePromise) templatePromise = fetchAsDataUrl(src)
  return templatePromise
}

function put(doc, xPt, yPt, text, options = {}) {
  const {
    size = DEFAULT_FONT_SIZE_PT,
    align = 'left',
    bold = true,
    maxWidthPt = null,
  } = options

  const content = String(text ?? '')
  if (!content) return

  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.setTextColor(0, 0, 0)

  if (maxWidthPt) {
    const maxWidth = ptX(maxWidthPt)
    let fontSize = size
    while (fontSize > 5.5 && doc.getTextWidth(content) > maxWidth) {
      fontSize -= 0.2
      doc.setFontSize(fontSize)
    }
  }

  doc.text(content, ptX(xPt), ptY(yPt), { align })
}

// Coordinate ricavate direttamente da un modello C1 già compilato e
// perfettamente sovrapposto al fondo grafico fornito dall'utente.
const POS = {
  dailyDate: { x: 183.18, y: 50.99, align: 'center' },
  eventTitle: { x: 200.25, y: 186.35, align: 'left', maxWidthPt: 360 },
  eventDate: { x: 439.75, y: 234.76, align: 'center' },
  eventTime: { x: 561.37, y: 234.76, align: 'center' },

  firstRow: {
    price: { x: 203.91, y: 288.51 },
    admissions: { x: 242.55, y: 288.51 },
    gross: { x: 294.08, y: 288.51 },
    cancelled: { x: 758.35, y: 288.51 },
  },

  totalVatDue: {
    admissions: { x: 242.55, y: 362.98 },
    gross: { x: 294.08, y: 362.98 },
    cancelled: { x: 758.35, y: 362.98 },
  },

  totalVatPrepaid: {
    admissions: { x: 241.20, y: 446.45 },
    gross: { x: 292.73, y: 446.45 },
    entertainmentTax: { x: 538.59, y: 446.45 },
    taxable: { x: 618.30, y: 446.45 },
    vat: { x: 697.29, y: 446.45 },
    cancelled: { x: 758.35, y: 446.45 },
  },
}

function putCentered(doc, position, value, options = {}) {
  put(doc, position.x, position.y, value, { align: 'center', ...options })
}

function addEventPage(doc, event, templateData, isFirstPage) {
  if (!isFirstPage) doc.addPage('a4', 'landscape')

  // Il fondo contiene già tutti i dati fissi, il timbro e la firma.
  // Sopra vengono stampati esclusivamente i dati che cambiano per evento.
  doc.addImage(
    templateData,
    'PNG',
    0,
    0,
    PAGE_WIDTH_MM,
    PAGE_HEIGHT_MM,
    'nova-siae-c1-template',
    'FAST'
  )

  const date = formatDate(event.event_date)
  const admissions = Math.max(0, Math.trunc(Number(event.admissions || 0)))
  const unitPrice = Number(event.unit_price || 0)
  const gross = Number(event.gross_amount || 0)
  const taxable = Number(event.taxable_amount || 0)
  const entertainmentTax = Number(event.entertainment_tax || 0)
  const vat = Number(event.vat_amount || 0)
  const cancelled = Math.max(0, Math.trunc(Number(event.cancelled_tickets || 0)))

  put(doc, POS.dailyDate.x, POS.dailyDate.y, date, { align: POS.dailyDate.align })
  put(doc, POS.eventTitle.x, POS.eventTitle.y, event.event_title || '', {
    align: POS.eventTitle.align,
    maxWidthPt: POS.eventTitle.maxWidthPt,
  })
  putCentered(doc, POS.eventDate, date)
  putCentered(doc, POS.eventTime, String(event.event_time || '').slice(0, 5))

  putCentered(doc, POS.firstRow.price, formatNumber(unitPrice, unitPrice % 1 === 0 ? 0 : 2))
  putCentered(doc, POS.firstRow.admissions, String(admissions))
  putCentered(doc, POS.firstRow.gross, formatNumber(gross))
  if (cancelled > 0) putCentered(doc, POS.firstRow.cancelled, String(cancelled))

  putCentered(doc, POS.totalVatDue.admissions, String(admissions))
  putCentered(doc, POS.totalVatDue.gross, formatNumber(gross))
  if (cancelled > 0) putCentered(doc, POS.totalVatDue.cancelled, String(cancelled))

  putCentered(doc, POS.totalVatPrepaid.admissions, String(admissions))
  putCentered(doc, POS.totalVatPrepaid.gross, formatNumber(gross))
  putCentered(doc, POS.totalVatPrepaid.entertainmentTax, formatNumber(entertainmentTax))
  putCentered(doc, POS.totalVatPrepaid.taxable, formatNumber(taxable))
  putCentered(doc, POS.totalVatPrepaid.vat, formatNumber(vat))
  if (cancelled > 0) putCentered(doc, POS.totalVatPrepaid.cancelled, String(cancelled))
}

export async function buildSiaeC1Pdf(events, options = {}) {
  const rows = Array.isArray(events) ? events : [events]
  if (!rows.length) throw new Error('Non ci sono eventi da esportare.')

  const templateData = await loadTemplate(options.templateSrc || '/siae-c1-template.png')
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  })

  rows.forEach((event, index) => addEventPage(doc, event, templateData, index === 0))
  return doc
}

export async function downloadSiaeC1Event(event) {
  const doc = await buildSiaeC1Pdf([event])
  const date = String(event.event_date || '').replaceAll('-', '')
  doc.save(`MOD_C1_${date}_${safeFilename(event.event_title)}.pdf`)
}

export async function downloadSiaeC1Month(events, month) {
  const sorted = [...events].sort((a, b) => {
    const dateCompare = String(a.event_date).localeCompare(String(b.event_date))
    if (dateCompare !== 0) return dateCompare
    return String(a.event_time || '').localeCompare(String(b.event_time || ''))
  })
  const doc = await buildSiaeC1Pdf(sorted)
  doc.save(`MOD_C1_${safeFilename(monthLabel(month)).toUpperCase()}.pdf`)
}
