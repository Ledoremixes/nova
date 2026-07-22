import dayjs from 'dayjs'
import { supabase } from './supabase'
import { fetchLastSumupImport } from './entries'

export function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

function formatDateLabel(value) {
  if (!value) return '-'
  return dayjs(value).format('DD/MM/YYYY')
}

function formatDateTimeLabel(value) {
  if (!value) return null
  return dayjs(value).format('DD/MM/YYYY HH:mm')
}

function normalizeNature(nature) {
  const value = String(nature || '').trim().toLowerCase()
  if (value === 'istituzionale') return 'istituzionale'
  if (value === 'commerciale') return 'commerciale'
  return 'default'
}

function normalizeNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function normalizeMethod(method) {
  return String(method || '').trim().toLowerCase()
}

function isCashMethod(method) {
  const normalized = normalizeMethod(method)
  return normalized === 'contanti' || normalized === 'contante' || normalized === 'cassa' || normalized === 'cash'
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function normalizeAccountCode(value) {
  return String(value || '').trim().toUpperCase()
}

function isInternalTransfer(row) {
  const source = normalizeText(row?.source)
  const nature = normalizeText(row?.nature)
  const accountCode = normalizeAccountCode(row?.account_code)
  const note = normalizeText(row?.note)

  return (
    nature === 'trasferimento' ||
    accountCode === 'GIRO' ||
    source === 'trasferimento interno' ||
    note.includes('trasferimento interno') ||
    note.includes('nova-transfer:')
  )
}

function bucketFromConfiguredAccount(config, amountIn, amountOut) {
  if (!config) return null

  const area = normalizeText(config.report_area)
  const configuredBucket = normalizeAccountCode(config.report_bucket)

  if (area === 'istituzionale' || configuredBucket.includes('ISTITUZIONAL')) {
    return 'istituzionale'
  }
  if (area === 'commerciale' || configuredBucket.includes('COMMERCIAL')) {
    return 'commerciale'
  }
  if (area === 'finanziaria' || configuredBucket.includes('FINANZIAR')) {
    return 'finanziaria'
  }
  if (area === 'supporto_generale' || configuredBucket.includes('SUPPORTO')) {
    return 'supporto_generale'
  }
  if (area === 'da_classificare' || configuredBucket.includes('DA_CLASSIFICARE')) {
    return 'non_classificate'
  }

  // Fallback utile quando è valorizzato solo il bucket A/C/D/E.
  if (configuredBucket.startsWith('A_')) return 'istituzionale'
  if (configuredBucket.startsWith('C_')) return 'commerciale'
  if (configuredBucket.startsWith('D_')) return 'finanziaria'
  if (configuredBucket.startsWith('E_')) return 'supporto_generale'

  // Se il conto non è configurato non forziamo una classificazione errata.
  return amountIn > 0 || amountOut > 0 ? null : 'non_classificate'
}

function fallbackLineCode(bucket, amountIn) {
  const isIncome = amountIn > 0

  if (bucket === 'istituzionale') return isIncome ? 'RA13' : 'CA7'
  if (bucket === 'commerciale') return isIncome ? 'RC3' : 'CC3'
  if (bucket === 'finanziaria') return isIncome ? 'RD5' : 'CD5'
  if (bucket === 'supporto_generale') return isIncome ? 'RE3' : 'CE7'

  return null
}

function isValidLineCode(lineCode, amountIn, amountOut) {
  if (!lineCode) return false
  const normalized = normalizeAccountCode(lineCode)
  return amountIn > 0 ? normalized.startsWith('R') : amountOut > 0 ? normalized.startsWith('C') : false
}

const COMMERCIAL_PRODUCT_KEYWORDS = [
  'prodotti bar',
  'bevande',
  'bomboloni',
  'brioche',
  'schiacciata',
  'pizza',
  'pizze',
  "forno d'asolo",
  'forno d asolo',
  'partesa',
  'sammontana',
  'iperal',
  'iper la grande i',
  'tosano',
  'drink',
  'consumazione',
  'caffè',
  'caffe',
  'birra',
  'amaro',
  'lavastoviglie',
  'materiali per cucina',
  'bicchieri',
]

const LINE_DEFINITIONS = {
  out: [
    { section: 'A', code: 'CA1', label: '1) Materie prime, sussidiarie, di consumo e merci' },
    { section: 'A', code: 'CA2', label: '2) Servizi' },
    { section: 'A', code: 'CA3', label: '3) Affiliazioni e tesseramenti' },
    { section: 'A', code: 'CA4', label: '4) Godimento beni di terzi' },
    { section: 'A', code: 'CA5', label: '5) Personale' },
    { section: 'A', code: 'CA7', label: '7) Altre uscite istituzionali' },

    { section: 'C', code: 'CC1', label: '1) Uscite per attività commerciali connesse a scopi istituzionali' },
    { section: 'C', code: 'CC2', label: '2) Uscite per raccolte pubbliche di fondi occasionali' },
    { section: 'C', code: 'CC3', label: '3) Altre uscite commerciali' },

    { section: 'D', code: 'CD1', label: '1) Su rapporti bancari' },
    { section: 'D', code: 'CD5', label: '5) Altre uscite' },

    { section: 'E', code: 'CE2', label: '2) Servizi' },
    { section: 'E', code: 'CE7', label: '5) Altre uscite' },
  ],

  in: [
    { section: 'A', code: 'RA1', label: '1) Entrate da quote associative / contributi istituzionali' },
    { section: 'A', code: 'RA5', label: '5) Erogazioni liberali' },
    { section: 'A', code: 'RA10', label: '10) Entrate da contratti con enti pubblici' },
    { section: 'A', code: 'RA11', label: '12) Entrate per attività in convenzione o regime di accreditamento' },
    { section: 'A', code: 'RA13', label: '13) Altre entrate istituzionali' },

    { section: 'C', code: 'RC1', label: '1) Entrate da attività commerciali connesse a scopi istituzionali' },
    { section: 'C', code: 'RC2', label: '2) Entrate da raccolte pubbliche di fondi occasionali' },
    { section: 'C', code: 'RC3', label: '3) Altre entrate commerciali' },

    { section: 'D', code: 'RD1', label: '1) Da rapporti bancari' },
    { section: 'D', code: 'RD5', label: '5) Altre entrate' },

    { section: 'E', code: 'RE1', label: '1) Entrate da distacco del personale' },
    { section: 'E', code: 'RE3', label: '3) Altre entrate di supporto generale' },
  ],
}

function createStatementAccumulator() {
  const makeMap = (definitions) =>
    definitions.reduce((acc, line) => {
      acc[line.code] = {
        ...line,
        amount: 0,
        rowsCount: 0,
      }

      return acc
    }, {})

  return {
    out: makeMap(LINE_DEFINITIONS.out),
    in: makeMap(LINE_DEFINITIONS.in),
  }
}

function classifyReportEntry(row, accountClassifications = new Map()) {
  const description = normalizeText(row.description)
  const note = normalizeText(row.note)
  const source = normalizeText(row.source)
  const text = `${description} ${note} ${source}`

  const accountCode = normalizeAccountCode(row.account_code)
  const nature = normalizeText(row.nature)

  const amountIn = normalizeNumber(row.amount_in)
  const amountOut = normalizeNumber(row.amount_out)

  // I versamenti tra cassa e banca spostano denaro, ma non sono né ricavi né costi.
  if (isInternalTransfer(row)) {
    return { bucket: 'trasferimenti', lineCode: null, isTransfer: true }
  }

  // La configurazione presente in Conti è la fonte primaria del rendiconto.
  // Prima veniva ignorata e il sistema provava a indovinare dalla descrizione:
  // questo poteva lasciare fuori importi perfettamente registrati.
  const configuredAccount = accountClassifications.get(accountCode)
  const configuredBucket = bucketFromConfiguredAccount(configuredAccount, amountIn, amountOut)

  if (configuredBucket) {
    const configuredLine = normalizeAccountCode(configuredAccount?.report_row_code)
    return {
      bucket: configuredBucket,
      lineCode: isValidLineCode(configuredLine, amountIn, amountOut)
        ? configuredLine
        : fallbackLineCode(configuredBucket, amountIn),
      isTransfer: false,
      classificationSource: 'account',
    }
  }

  if (amountIn > 0) {
    if (accountCode === 'C' || containsAny(text, COMMERCIAL_PRODUCT_KEYWORDS)) {
      return { bucket: 'commerciale', lineCode: 'RC1' }
    }

    if (
      accountCode === 'IST' ||
      accountCode === 'AS' ||
      containsAny(text, [
        'quota associativa',
        'contributo associativo',
        'tesseramento',
        'ingresso asd',
        'ingresso bwave',
        'ingresso country',
        'ingresso latino',
        'importo personalizzato',
      ])
    ) {
      return { bucket: 'istituzionale', lineCode: 'RA1' }
    }

    if (nature === 'istituzionale') {
      return { bucket: 'istituzionale', lineCode: 'RA13' }
    }

    if (nature === 'commerciale') {
      return { bucket: 'commerciale', lineCode: 'RC3' }
    }

    if (nature === 'finanziaria') {
      return { bucket: 'finanziaria', lineCode: 'RD5' }
    }

    if (nature === 'supporto_generale') {
      return { bucket: 'supporto_generale', lineCode: 'RE3' }
    }

    return { bucket: 'non_classificate', lineCode: null }
  }

  if (amountOut > 0) {
    if (containsAny(text, ['affitto'])) {
      return { bucket: 'istituzionale', lineCode: 'CA4' }
    }

    if (containsAny(text, ['opes', 'tessere', 'tessera', 'affiliazione'])) {
      return { bucket: 'istituzionale', lineCode: 'CA3' }
    }

    if (
      containsAny(text, [
        'pagamento corsi',
        'rimborso spese corso',
        'insegnanti',
        'compenso',
      ])
    ) {
      return { bucket: 'istituzionale', lineCode: 'CA5' }
    }

    if (
      containsAny(text, [
        'siae',
        'pulizia',
        'pulizie',
        'liam service',
        'astra',
        'scia',
        'suap',
        'ats',
      ])
    ) {
      return { bucket: 'istituzionale', lineCode: 'CA2' }
    }

    if (containsAny(text, ['teli proteggi tavolini', 'tecnomat', 'estintore'])) {
      return { bucket: 'istituzionale', lineCode: 'CA7' }
    }

    if (accountCode === 'OR' || containsAny(text, ['biglietti evento', 'evento country'])) {
      return { bucket: 'commerciale', lineCode: 'CC2' }
    }

    if (
      accountCode === 'CB1' ||
      accountCode === 'CB2' ||
      containsAny(text, COMMERCIAL_PRODUCT_KEYWORDS)
    ) {
      return { bucket: 'commerciale', lineCode: 'CC1' }
    }

    if (
      containsAny(text, [
        'abbonamento sumup',
        'commissioni bancarie',
        'commissioni sumup',
        'spese bancarie',
        'bonifico istantaneo',
      ])
    ) {
      return { bucket: 'finanziaria', lineCode: 'CD1' }
    }

    if (
      accountCode === 'AFF' ||
      accountCode === 'AF' ||
      accountCode === 'M' ||
      accountCode === 'S' ||
      accountCode === 'SCU'
    ) {
      return { bucket: 'istituzionale', lineCode: 'CA2' }
    }

    if (nature === 'istituzionale') {
      return { bucket: 'istituzionale', lineCode: 'CA7' }
    }

    if (nature === 'commerciale') {
      return { bucket: 'commerciale', lineCode: 'CC3' }
    }

    if (nature === 'finanziaria') {
      return { bucket: 'finanziaria', lineCode: 'CD5' }
    }

    if (nature === 'supporto_generale') {
      return { bucket: 'supporto_generale', lineCode: 'CE7' }
    }

    return { bucket: 'non_classificate', lineCode: null }
  }

  return { bucket: 'non_classificate', lineCode: null }
}

function summarizeRows(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.totalIn += normalizeNumber(row.amount_in)
      acc.totalOut += normalizeNumber(row.amount_out)
      acc.rowsCount += 1
      acc.saldo = acc.totalIn - acc.totalOut

      return acc
    },
    {
      totalIn: 0,
      totalOut: 0,
      saldo: 0,
      rowsCount: 0,
    }
  )
}

function buildStatement(rows, accountClassifications = new Map()) {
  const statement = createStatementAccumulator()
  const classifiedRows = []

  for (const originalRow of rows) {
    const row = {
      ...originalRow,
      amount_in: normalizeNumber(originalRow.amount_in),
      amount_out: normalizeNumber(originalRow.amount_out),
      saldo:
        normalizeNumber(originalRow.amount_in) -
        normalizeNumber(originalRow.amount_out),
      dateLabel: formatDateLabel(originalRow.operation_datetime || originalRow.date),
    }

    const report = classifyReportEntry(row, accountClassifications)

    row.report_bucket = report.bucket
    row.report_line_code = report.lineCode
    row.is_internal_transfer = Boolean(report.isTransfer)
    row.classification_source = report.classificationSource || 'fallback'

    classifiedRows.push(row)

    if (row.is_internal_transfer) continue

    if (row.amount_in > 0 && report.lineCode && statement.in[report.lineCode]) {
      statement.in[report.lineCode].amount += row.amount_in
      statement.in[report.lineCode].rowsCount += 1
    }

    if (row.amount_out > 0 && report.lineCode && statement.out[report.lineCode]) {
      statement.out[report.lineCode].amount += row.amount_out
      statement.out[report.lineCode].rowsCount += 1
    }
  }

  const economicRows = classifiedRows.filter((row) => !row.is_internal_transfer)
  const rowsByBucket = {
    istituzionale: economicRows.filter((row) => row.report_bucket === 'istituzionale'),
    commerciale: economicRows.filter((row) => row.report_bucket === 'commerciale'),
    finanziaria: economicRows.filter((row) => row.report_bucket === 'finanziaria'),
    supportoGenerale: economicRows.filter((row) => row.report_bucket === 'supporto_generale'),
    nonClassificate: economicRows.filter((row) => row.report_bucket === 'non_classificate'),
    trasferimenti: classifiedRows.filter((row) => row.report_bucket === 'trasferimenti'),
  }

  return {
    rows: classifiedRows,
    economicRows,
    rowsByBucket,
    summary: {
      istituzionale: summarizeRows(rowsByBucket.istituzionale),
      commerciale: summarizeRows(rowsByBucket.commerciale),
      finanziaria: summarizeRows(rowsByBucket.finanziaria),
      supportoGenerale: summarizeRows(rowsByBucket.supportoGenerale),
      nonClassificate: summarizeRows(rowsByBucket.nonClassificate),
      trasferimenti: summarizeRows(rowsByBucket.trasferimenti),
      totale: summarizeRows(economicRows),
    },
    statement: {
      out: LINE_DEFINITIONS.out.map((line) => ({
        ...line,
        amount: statement.out[line.code]?.amount || 0,
        rowsCount: statement.out[line.code]?.rowsCount || 0,
      })),
      in: LINE_DEFINITIONS.in.map((line) => ({
        ...line,
        amount: statement.in[line.code]?.amount || 0,
        rowsCount: statement.in[line.code]?.rowsCount || 0,
      })),
    },
  }
}

async function fetchAccountClassificationMap() {
  const { data, error } = await supabase
    .from('lookup_options')
    .select('user_id, value, report_area, report_bucket, report_row_code, report_row_label, is_active')
    .eq('section_key', 'contabilita')
    .eq('list_key', 'conti_rendiconto')
    .eq('is_active', true)

  if (error) {
    // Manteniamo il rendiconto operativo anche se la migrazione lookup non è stata
    // ancora applicata: in quel caso entra in gioco la classificazione di fallback.
    console.warn('Classificazione conti non disponibile:', error.message)
    return new Map()
  }

  const classifications = new Map()

  for (const item of data || []) {
    const code = normalizeAccountCode(item.value)
    if (!code) continue

    const existing = classifications.get(code)
    // Le configurazioni globali (user_id nullo) hanno precedenza sulle vecchie
    // copie per utente create dalle migrazioni iniziali.
    if (!existing || (existing.user_id && !item.user_id)) {
      classifications.set(code, item)
    }
  }

  return classifications
}

async function fetchEntriesPageSet({
  fromDate,
  toDate,
  select,
  useTimestampFallback = false,
}) {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    let query = supabase
      .from('entries')
      .select(select)
      .order(useTimestampFallback ? 'operation_datetime' : 'date', {
        ascending: false,
        nullsFirst: false,
      })
      .order('id_key', { ascending: false })
      .range(from, from + pageSize - 1)

    if (useTimestampFallback) {
      // Solo record legacy senza data contabile. Gli altri vengono filtrati sul
      // campo date, che evita slittamenti di un giorno dovuti al fuso orario.
      query = query.is('date', null)
      if (fromDate) query = query.gte('operation_datetime', `${fromDate}T00:00:00`)
      if (toDate) query = query.lte('operation_datetime', `${toDate}T23:59:59`)
    } else {
      if (fromDate) query = query.gte('date', fromDate)
      if (toDate) query = query.lte('date', toDate)
    }

    const { data, error } = await query
    if (error) throw error

    const chunk = data || []
    rows.push(...chunk)

    if (chunk.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchAllEntriesPaged({
  fromDate,
  toDate,
  select = `
    id,
    date,
    operation_datetime,
    description,
    amount_in,
    amount_out,
    account_code,
    method,
    center,
    note,
    source,
    nature,
    vat_rate,
    vat_amount,
    vat_side,
    id_key
  `,
}) {
  // Il campo date è la data contabile e quindi la fonte primaria del periodo.
  // operation_datetime viene usato solo per vecchie righe prive di date.
  if (fromDate || toDate) {
    const [datedRows, legacyTimestampRows] = await Promise.all([
      fetchEntriesPageSet({ fromDate, toDate, select }),
      fetchEntriesPageSet({ fromDate, toDate, select, useTimestampFallback: true }),
    ])

    return [...datedRows, ...legacyTimestampRows]
  }

  return fetchEntriesPageSet({ select })
}

function sumBalanceByMethod(rows, predicate) {
  return (rows || [])
    .filter((row) => predicate(row.method))
    .reduce(
      (acc, row) =>
        acc + normalizeNumber(row.amount_in) - normalizeNumber(row.amount_out),
      0
    )
}

export async function fetchRecentAccountingEntries(limit = 8, { rows, fromDate, toDate } = {}) {
  const sourceRows = rows || await fetchAllEntriesPaged({
    fromDate,
    toDate,
    select: 'id, date, operation_datetime, description, amount_in, amount_out, account_code, nature, id_key',
  })

  return [...sourceRows]
    .sort((left, right) => {
      const leftDate = dayjs(left.operation_datetime || left.date).valueOf()
      const rightDate = dayjs(right.operation_datetime || right.date).valueOf()
      if (leftDate !== rightDate) return rightDate - leftDate
      return Number(right.id_key || 0) - Number(left.id_key || 0)
    })
    .slice(0, limit)
    .map((row) => ({
    id: row.id,
    dateLabel: formatDateLabel(row.operation_datetime || row.date),
    description: row.description,
    accountCode: row.account_code,
    amountIn: normalizeNumber(row.amount_in),
    amountOut: normalizeNumber(row.amount_out),
    natureLabel: row.nature || '',
    natureKey: normalizeNature(row.nature),
    }))
}

export async function fetchContabilitaOverview({ rows, fromDate, toDate } = {}) {
  const [sourceRows, lastImport] = await Promise.all([
    rows
      ? Promise.resolve(rows)
      : fetchAllEntriesPaged({
          fromDate,
          toDate,
          select: 'id, date, operation_datetime, nature, account_code, description, amount_in, amount_out, id_key',
        }),
    fetchLastSumupImport(),
  ])

  const uncategorizedEntriesCount = (sourceRows || []).filter((row) => {
    return !String(row.nature || '').trim() || !String(row.account_code || '').trim()
  }).length

  return {
    uncategorizedEntriesCount,
    lastSumupImportAt: lastImport?.created_at || null,
    lastSumupImportLabel: formatDateTimeLabel(lastImport?.created_at),
    lastSumupImportRows: Number(lastImport?.imported_rows || 0),
  }
}

export async function fetchRendicontoGestionale({
  fromDate,
  toDate,
  periodicity = 'quarterly',
}) {
  // Una sola lettura del periodo alimenta rendiconto, IVA e saldi per metodo.
  const [currentRows, accountClassifications] = await Promise.all([
    fetchAllEntriesPaged({ fromDate, toDate }),
    fetchAccountClassificationMap(),
  ])

  const current = buildStatement(currentRows, accountClassifications)
  const ivaSummary = buildIvaSummaryFromRows(currentRows, {
    fromDate,
    toDate,
    accountClassifications,
  })
  const ivaScadenziario = buildIvaScadenziarioFromSummary({
    iva: ivaSummary,
    fromDate,
    toDate,
    periodicity,
  })

  // I trasferimenti interni devono incidere sul singolo conto cassa/banca,
  // mantenendo invariata la liquidità totale e il risultato economico.
  const cashBalance = sumBalanceByMethod(currentRows, (method) => {
    return isCashMethod(method)
  })
  const bankBalance = sumBalanceByMethod(currentRows, (method) => {
    return !isCashMethod(method)
  })
  return {
    rows: current.rows,
    economicRows: current.economicRows,
    summary: current.summary,
    statement: current.statement,
    comparison: null,
    financialPosition: {
      current: {
        total: cashBalance + bankBalance,
        cashBalance,
        bankBalance,
        portfolioBalance: 0,
      },
      comparison: null,
    },
    methodSummary: {
      cashBalance,
      bankBalance,
      total: cashBalance + bankBalance,
    },
    ivaSummary,
    ivaScadenziario,
    meta: {
      fromDate,
      toDate,
      criteriaNote:
        'Il rendiconto usa la classificazione configurata nei Conti. I trasferimenti tra cassa e banca sono esclusi da entrate e uscite ma aggiornano i saldi dei due conti.',
    },
  }
}

export async function fetchFinancialPosition({
  fromDate,
  toDate,
  openingCashBalance = 0,
  openingBankBalance = 0,
  receivables = 0,
  payables = 0,
  rows,
}) {
  const sourceRows = rows || await fetchAllEntriesPaged({
    fromDate,
    toDate,
    select: 'id, date, operation_datetime, amount_in, amount_out, method, id_key',
  })

  const cashMovement = sumBalanceByMethod(sourceRows, (method) => {
    return isCashMethod(method)
  })
  const bankMovement = sumBalanceByMethod(sourceRows, (method) => {
    return !isCashMethod(method)
  })
  const cashBalance = normalizeNumber(openingCashBalance) + cashMovement
  const bankBalance = normalizeNumber(openingBankBalance) + bankMovement
  const liquidity = cashBalance + bankBalance
  const normalizedReceivables = normalizeNumber(receivables)
  const normalizedPayables = normalizeNumber(payables)

  return {
    fromDate,
    toDate,
    openingCashBalance: normalizeNumber(openingCashBalance),
    openingBankBalance: normalizeNumber(openingBankBalance),
    cashMovement,
    bankMovement,
    cashBalance,
    bankBalance,
    liquidity,
    receivables: normalizedReceivables,
    payables: normalizedPayables,
    financialPosition: liquidity + normalizedReceivables - normalizedPayables,
  }
}

function getIvaReferenceDate(row) {
  return row?.date || row?.operation_datetime || null
}

function isDateInSelectedRange(value, fromDate, toDate) {
  const d = dayjs(value)

  if (!d.isValid()) return false
  if (fromDate && d.isBefore(dayjs(fromDate), 'day')) return false
  if (toDate && d.isAfter(dayjs(toDate), 'day')) return false

  return true
}

function normalizeVatRate(value) {
  const raw = String(value ?? '')
    .replace('%', '')
    .replace(',', '.')
    .trim()

  const n = Number(raw || 0)
  return Number.isFinite(n) ? n : 0
}

function calculateCommercialVat(row) {
  const explicitVat = normalizeNumber(row.vat_amount)
  const side = normalizeText(row.vat_side)

  if (explicitVat > 0 && (side === 'debito' || !side)) {
    return explicitVat
  }

  const amountIn = normalizeNumber(row.amount_in)
  const rate = normalizeVatRate(row.vat_rate)

  if (amountIn > 0 && rate > 0) {
    return amountIn - amountIn / (1 + rate / 100)
  }

  return 0
}

function calculateCommercialTaxable(row) {
  const amountIn = normalizeNumber(row.amount_in)
  const vat = calculateCommercialVat(row)

  return Math.max(amountIn - vat, 0)
}

function classifyCommercialIncomeType(row) {
  const description = normalizeText(row.description)
  const note = normalizeText(row.note)
  const source = normalizeText(row.source)
  const text = `${description} ${note} ${source}`
  const accountCode = String(row.account_code || '').trim().toUpperCase()

  if (
    containsAny(text, [
      'sponsor',
      'sponsorizzazione',
      'sponsorizzazioni',
      'pubblicità',
      'pubblicita',
      'banner',
      'partner',
    ])
  ) {
    return { key: 'sponsorizzazioni', label: 'Sponsorizzazioni' }
  }

  if (
    containsAny(text, [
      'maglietta',
      'magliette',
      't-shirt',
      'tshirt',
      'felpa',
      'felpe',
      'abbigliamento',
      'gadget',
      'merch',
      'merchandising',
      'materiale',
      'vendita materiale',
    ])
  ) {
    return { key: 'vendita_materiale', label: 'Vendita materiale' }
  }

  if (
    accountCode === 'C' ||
    accountCode === 'CB1' ||
    accountCode === 'CB2' ||
    containsAny(text, COMMERCIAL_PRODUCT_KEYWORDS) ||
    containsAny(text, [
      'bar',
      'cassa bar',
      'sumup bar',
      'incasso bar',
      'bevuta',
      'bevute',
      'cocktail',
      'analcolico',
      'acqua',
      'bibita',
      'bibite',
    ])
  ) {
    return { key: 'entrate_bar', label: 'Entrate bar' }
  }

  if (
    containsAny(text, [
      'biglietto',
      'biglietti',
      'ticket',
      'prevendita',
      'ingresso evento',
      'serata',
      'evento',
    ])
  ) {
    return { key: 'biglietteria_eventi', label: 'Biglietteria / eventi commerciali' }
  }

  return { key: 'altre_entrate_commerciali', label: 'Altre entrate commerciali' }
}

function isCommercialIncomeRow(row, accountClassifications = new Map()) {
  const amountIn = normalizeNumber(row.amount_in)
  if (amountIn <= 0) return false

  const report = classifyReportEntry(row, accountClassifications)

  // IMPORTANTE:
  // Per evitare differenze tra Rendiconto gestionale e PDF IVA,
  // consideriamo commerciali solo le righe che la stessa logica
  // del rendiconto classifica come commerciali.
  return report.bucket === 'commerciale'
}

function normalizeIvaReportRow(row) {
  const referenceDate = getIvaReferenceDate(row)
  const commercialType = classifyCommercialIncomeType(row)
  const vatAmount = calculateCommercialVat(row)
  const taxableAmount = calculateCommercialTaxable(row)

  return {
    ...row,
    reference_date: referenceDate,
    dateLabel: formatDateLabel(referenceDate),
    amount_in: normalizeNumber(row.amount_in),
    amount_out: normalizeNumber(row.amount_out),
    vat_amount: normalizeNumber(row.vat_amount),
    commercial_vat_amount: vatAmount,
    commercial_taxable_amount: taxableAmount,
    commercial_type_key: commercialType.key,
    commercial_type_label: commercialType.label,
  }
}

async function fetchIvaCandidateRowsPaged({ fromDate, toDate } = {}) {
  const rows = await fetchAllEntriesPaged({
    fromDate,
    toDate,
    select: `
      id,
      date,
      operation_datetime,
      description,
      amount_in,
      amount_out,
      account_code,
      method,
      center,
      note,
      source,
      nature,
      vat_rate,
      vat_amount,
      vat_side,
      id_key
    `,
  })

  return rows.filter((row) => {
    return normalizeNumber(row.amount_in) > 0 || normalizeNumber(row.vat_amount) > 0
  })
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

function monthKeyFromDate(value) {
  const d = dayjs(value)
  return `${d.year()}-${String(d.month() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key) {
  const [year, month] = String(key).split('-')
  return `${monthNameFromNumber(Number(month))} ${year}`
}

function periodKeyFromDate(value, periodicity) {
  const d = dayjs(value)

  if (periodicity === 'monthly') {
    return monthKeyFromDate(value)
  }

  return `${d.year()}-Q${Math.floor(d.month() / 3) + 1}`
}

function periodLabelFromDate(value, periodicity) {
  const d = dayjs(value)

  if (periodicity === 'monthly') {
    return d.format('MM/YYYY')
  }

  return `Q${Math.floor(d.month() / 3) + 1} ${d.year()}`
}

function buildMonthKeysInRange(fromDate, toDate) {
  if (!fromDate || !toDate) return []

  const start = dayjs(fromDate).startOf('month')
  const end = dayjs(toDate).startOf('month')
  const months = []

  if (!start.isValid() || !end.isValid()) return months

  let cursor = start

  while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
    months.push(`${cursor.year()}-${String(cursor.month() + 1).padStart(2, '0')}`)
    cursor = cursor.add(1, 'month')
  }

  return months
}

function createIvaAggregate({ key, label, monthKeys = [] }) {
  return {
    key,
    label,
    vatDebit: 0,
    vatCredit: 0,
    balance: 0,
    grossCommercialIncome: 0,
    taxableCommercialIncome: 0,
    commercialRowsCount: 0,
    rows: [],
    months: monthKeys.map((monthKey) => ({
      key: monthKey,
      label: monthLabelFromKey(monthKey),
      vatDebit: 0,
      vatCredit: 0,
      balance: 0,
      grossCommercialIncome: 0,
      taxableCommercialIncome: 0,
      commercialRowsCount: 0,
      rows: [],
      types: [],
      _typeMap: new Map(),
    })),
    types: [],
    _typeMap: new Map(),
  }
}

function ensureTypeAggregate(target, row) {
  const key = row.commercial_type_key || 'altre_entrate_commerciali'
  const label = row.commercial_type_label || 'Altre entrate commerciali'

  if (!target._typeMap) target._typeMap = new Map()

  if (!target._typeMap.has(key)) {
    const item = {
      key,
      label,
      vatDebit: 0,
      vatCredit: 0,
      balance: 0,
      grossCommercialIncome: 0,
      taxableCommercialIncome: 0,
      commercialRowsCount: 0,
      rows: [],
    }

    target._typeMap.set(key, item)
    target.types.push(item)
  }

  return target._typeMap.get(key)
}

function addCommercialRowToAggregate(target, row) {
  const vat = normalizeNumber(row.commercial_vat_amount)
  const taxable = normalizeNumber(row.commercial_taxable_amount)
  const gross = normalizeNumber(row.amount_in)

  target.vatDebit += vat
  target.balance = target.vatDebit - target.vatCredit
  target.grossCommercialIncome += gross
  target.taxableCommercialIncome += taxable
  target.commercialRowsCount += 1
  target.rows.push(row)

  const typeTarget = ensureTypeAggregate(target, row)
  typeTarget.vatDebit += vat
  typeTarget.balance = typeTarget.vatDebit - typeTarget.vatCredit
  typeTarget.grossCommercialIncome += gross
  typeTarget.taxableCommercialIncome += taxable
  typeTarget.commercialRowsCount += 1
  typeTarget.rows.push(row)
}

function addCreditVatToAggregate(target, row) {
  const creditVat = normalizeNumber(row.vat_amount)

  target.vatCredit += creditVat
  target.balance = target.vatDebit - target.vatCredit
}

function cleanupIvaAggregate(target) {
  target.balance = target.vatDebit - target.vatCredit
  target.types = (target.types || []).sort((a, b) => a.label.localeCompare(b.label))
  delete target._typeMap

  target.months = (target.months || []).map((month) => {
    month.balance = month.vatDebit - month.vatCredit
    month.types = (month.types || []).sort((a, b) => a.label.localeCompare(b.label))
    delete month._typeMap
    return month
  })

  return target
}

function buildIvaSummaryFromRows(rows, { fromDate, toDate, accountClassifications = new Map() } = {}) {
  const rowsInPeriod = (rows || [])
    .filter((row) => isDateInSelectedRange(getIvaReferenceDate(row), fromDate, toDate))
    .map(normalizeIvaReportRow)

  const commercialRows = rowsInPeriod.filter((row) => isCommercialIncomeRow(row, accountClassifications))
  const creditRows = rowsInPeriod.filter((row) => {
    return normalizeText(row.vat_side) === 'credito' && normalizeNumber(row.vat_amount) > 0
  })

  const vatDebit = commercialRows.reduce(
    (acc, row) => acc + normalizeNumber(row.commercial_vat_amount),
    0
  )
  const vatCredit = creditRows.reduce(
    (acc, row) => acc + normalizeNumber(row.vat_amount),
    0
  )
  const grossCommercialIncome = commercialRows.reduce(
    (acc, row) => acc + normalizeNumber(row.amount_in),
    0
  )
  const taxableCommercialIncome = commercialRows.reduce(
    (acc, row) => acc + normalizeNumber(row.commercial_taxable_amount),
    0
  )

  return {
    rows: commercialRows,
    commercialRows,
    creditRows,
    vatDebit,
    vatCredit,
    balance: vatDebit - vatCredit,
    grossCommercialIncome,
    taxableCommercialIncome,
  }
}

function buildIvaScadenziarioFromSummary({
  iva,
  fromDate,
  toDate,
  periodicity = 'quarterly',
}) {
  const monthKeys = buildMonthKeysInRange(fromDate, toDate)
  const buckets = new Map()

  for (const monthKey of monthKeys) {
    const refDate = `${monthKey}-01`
    const periodKey = periodKeyFromDate(refDate, periodicity)
    const periodLabel = periodLabelFromDate(refDate, periodicity)

    if (!buckets.has(periodKey)) {
      const monthsForPeriod = monthKeys.filter((currentMonthKey) => {
        return periodKeyFromDate(`${currentMonthKey}-01`, periodicity) === periodKey
      })

      buckets.set(
        periodKey,
        createIvaAggregate({
          key: periodKey,
          label: periodLabel,
          monthKeys: monthsForPeriod,
        })
      )
    }
  }

  for (const row of iva?.commercialRows || []) {
    const refDate = row.reference_date || getIvaReferenceDate(row)
    const periodKey = periodKeyFromDate(refDate, periodicity)
    const periodLabel = periodLabelFromDate(refDate, periodicity)
    const monthKey = monthKeyFromDate(refDate)

    if (!buckets.has(periodKey)) {
      buckets.set(
        periodKey,
        createIvaAggregate({ key: periodKey, label: periodLabel, monthKeys: [monthKey] })
      )
    }

    const period = buckets.get(periodKey)
    addCommercialRowToAggregate(period, row)

    let month = period.months.find((item) => item.key === monthKey)
    if (!month) {
      month = createIvaAggregate({ key: monthKey, label: monthLabelFromKey(monthKey), monthKeys: [] })
      period.months.push(month)
    }
    addCommercialRowToAggregate(month, row)
  }

  for (const row of iva?.creditRows || []) {
    const refDate = row.reference_date || getIvaReferenceDate(row)
    const periodKey = periodKeyFromDate(refDate, periodicity)
    const periodLabel = periodLabelFromDate(refDate, periodicity)
    const monthKey = monthKeyFromDate(refDate)

    if (!buckets.has(periodKey)) {
      buckets.set(
        periodKey,
        createIvaAggregate({ key: periodKey, label: periodLabel, monthKeys: [monthKey] })
      )
    }

    const period = buckets.get(periodKey)
    addCreditVatToAggregate(period, row)

    let month = period.months.find((item) => item.key === monthKey)
    if (!month) {
      month = createIvaAggregate({ key: monthKey, label: monthLabelFromKey(monthKey), monthKeys: [] })
      period.months.push(month)
    }
    addCreditVatToAggregate(month, row)
  }

  const periods = Array.from(buckets.values())
    .map(cleanupIvaAggregate)
    .sort((a, b) => a.key.localeCompare(b.key))

  return {
    periodicity,
    periods,
    totals: {
      vatDebit: periods.reduce((acc, item) => acc + item.vatDebit, 0),
      vatCredit: periods.reduce((acc, item) => acc + item.vatCredit, 0),
      balance: periods.reduce((acc, item) => acc + item.balance, 0),
      grossCommercialIncome: periods.reduce((acc, item) => acc + item.grossCommercialIncome, 0),
      taxableCommercialIncome: periods.reduce((acc, item) => acc + item.taxableCommercialIncome, 0),
      commercialRowsCount: periods.reduce((acc, item) => acc + item.commercialRowsCount, 0),
    },
  }
}

export async function fetchIvaSummary({ fromDate, toDate }) {
  const [rows, accountClassifications] = await Promise.all([
    fetchIvaCandidateRowsPaged({ fromDate, toDate }),
    fetchAccountClassificationMap(),
  ])
  return buildIvaSummaryFromRows(rows, { fromDate, toDate, accountClassifications })
}

export async function fetchIvaScadenziario({
  fromDate,
  toDate,
  periodicity = 'quarterly',
  iva: providedIva,
}) {
  const iva = providedIva || await fetchIvaSummary({ fromDate, toDate })
  return buildIvaScadenziarioFromSummary({ iva, fromDate, toDate, periodicity })
}
