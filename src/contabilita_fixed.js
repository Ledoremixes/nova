
import dayjs from 'dayjs'
import { supabase } from './supabase'
import { fetchEntriesFilteredTotals, fetchLastSumupImport } from './entries'

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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function startOfYearDate() {
  return dayjs().startOf('year').format('YYYY-MM-DD')
}

function endOfTodayDate() {
  return dayjs().format('YYYY-MM-DD')
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

function classifyReportEntry(row) {
  const description = normalizeText(row.description)
  const note = normalizeText(row.note)
  const source = normalizeText(row.source)
  const text = `${description} ${note} ${source}`
  const accountCode = String(row.account_code || '').trim().toUpperCase()
  const nature = normalizeText(row.nature)

  const amountIn = normalizeNumber(row.amount_in)
  const amountOut = normalizeNumber(row.amount_out)

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

    return { bucket: 'non_classificate', lineCode: 'RA13' }
  }

  if (amountOut > 0) {
    if (containsAny(text, ['affitto'])) {
      return { bucket: 'istituzionale', lineCode: 'CA4' }
    }

    if (containsAny(text, ['opes', 'tessere', 'tessera', 'affiliazione'])) {
      return { bucket: 'istituzionale', lineCode: 'CA3' }
    }

    if (containsAny(text, ['pagamento corsi', 'rimborso spese corso', 'insegnanti', 'compenso'])) {
      return { bucket: 'istituzionale', lineCode: 'CA5' }
    }

    if (containsAny(text, ['siae', 'pulizia', 'pulizie', 'liam service', 'astra', 'scia', 'suap', 'ats'])) {
      return { bucket: 'istituzionale', lineCode: 'CA2' }
    }

    if (containsAny(text, ['teli proteggi tavolini', 'tecnomat', 'estintore'])) {
      return { bucket: 'istituzionale', lineCode: 'CA7' }
    }

    if (accountCode === 'OR' || containsAny(text, ['biglietti evento', 'evento country'])) {
      return { bucket: 'commerciale', lineCode: 'CC2' }
    }

    if (accountCode === 'CB1' || accountCode === 'CB2' || containsAny(text, COMMERCIAL_PRODUCT_KEYWORDS)) {
      return { bucket: 'commerciale', lineCode: 'CC1' }
    }

    if (containsAny(text, ['abbonamento sumup', 'commissioni bancarie', 'bonifico istantaneo'])) {
      return { bucket: 'supporto_generale', lineCode: 'CD1' }
    }

    if (accountCode === 'AFF' || accountCode === 'AF' || accountCode === 'M' || accountCode === 'S' || accountCode === 'SCU') {
      return { bucket: 'istituzionale', lineCode: 'CA2' }
    }

    if (nature === 'istituzionale') {
      return { bucket: 'istituzionale', lineCode: 'CA7' }
    }

    if (nature === 'commerciale') {
      return { bucket: 'commerciale', lineCode: 'CC3' }
    }

    return { bucket: 'supporto_generale', lineCode: 'CE7' }
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
    { totalIn: 0, totalOut: 0, saldo: 0, rowsCount: 0 }
  )
}

function buildStatement(rows) {
  const statement = createStatementAccumulator()
  const classifiedRows = []

  for (const originalRow of rows) {
    const row = {
      ...originalRow,
      amount_in: normalizeNumber(originalRow.amount_in),
      amount_out: normalizeNumber(originalRow.amount_out),
      saldo: normalizeNumber(originalRow.amount_in) - normalizeNumber(originalRow.amount_out),
      dateLabel: formatDateLabel(originalRow.operation_datetime || originalRow.date),
    }

    const report = classifyReportEntry(row)

    row.report_bucket = report.bucket
    row.report_line_code = report.lineCode

    classifiedRows.push(row)

    if (row.amount_in > 0 && report.lineCode && statement.in[report.lineCode]) {
      statement.in[report.lineCode].amount += row.amount_in
      statement.in[report.lineCode].rowsCount += 1
    }

    if (row.amount_out > 0 && report.lineCode && statement.out[report.lineCode]) {
      statement.out[report.lineCode].amount += row.amount_out
      statement.out[report.lineCode].rowsCount += 1
    }
  }

  const rowsByBucket = {
    istituzionale: classifiedRows.filter((row) => row.report_bucket === 'istituzionale'),
    commerciale: classifiedRows.filter((row) => row.report_bucket === 'commerciale'),
    supportoGenerale: classifiedRows.filter((row) => row.report_bucket === 'supporto_generale'),
    nonClassificate: classifiedRows.filter((row) => row.report_bucket === 'non_classificate'),
  }

  return {
    rows: classifiedRows,
    rowsByBucket,
    summary: {
      istituzionale: summarizeRows(rowsByBucket.istituzionale),
      commerciale: summarizeRows(rowsByBucket.commerciale),
      supportoGenerale: summarizeRows(rowsByBucket.supportoGenerale),
      nonClassificate: summarizeRows(rowsByBucket.nonClassificate),
      totale: summarizeRows(classifiedRows),
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
  const pageSize = 1000
  let from = 0
  let keepLoading = true
  const allRows = []

  while (keepLoading) {
    let query = supabase
      .from('entries')
      .select(select)
      .order('operation_datetime', { ascending: false, nullsFirst: false })
      .order('id_key', { ascending: false })
      .range(from, from + pageSize - 1)

    if (fromDate) {
      query = query.gte('operation_datetime', `${fromDate}T00:00:00`)
    }

    if (toDate) {
      query = query.lte('operation_datetime', `${toDate}T23:59:59`)
    }

    const { data, error } = await query
    if (error) throw error

    const chunk = data || []
    allRows.push(...chunk)

    if (chunk.length < pageSize) {
      keepLoading = false
    } else {
      from += pageSize
    }
  }

  return allRows
}

function sumEntriesBalance(rows) {
  return (rows || []).reduce(
    (acc, row) => acc + normalizeNumber(row.amount_in) - normalizeNumber(row.amount_out),
    0
  )
}

function sumBalanceByMethod(rows, predicate) {
  return (rows || [])
    .filter((row) => predicate(row.method))
    .reduce(
      (acc, row) => acc + normalizeNumber(row.amount_in) - normalizeNumber(row.amount_out),
      0
    )
}

async function buildFinancialPosition(toDate) {
  const rows = await fetchAllEntriesPaged({
    toDate,
    select: 'method, amount_in, amount_out, id_key, operation_datetime',
  })

  const cashBalance = sumBalanceByMethod(rows, (method) => normalizeMethod(method) === 'contanti')
  const bankBalance = sumBalanceByMethod(rows, (method) => normalizeMethod(method) !== 'contanti')

  return {
    total: cashBalance + bankBalance,
    cashBalance,
    bankBalance,
    portfolioBalance: 0,
  }
}

export async function fetchRecentAccountingEntries(limit = 8) {
  const { data, error } = await supabase
    .from('entries')
    .select('id, date, operation_datetime, description, amount_in, amount_out, account_code, nature, id_key')
    .order('operation_datetime', { ascending: false, nullsFirst: false })
    .order('id_key', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data || []).map((row) => ({
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

export async function fetchContabilitaOverview() {
  const fromDate = startOfYearDate()
  const toDate = endOfTodayDate()

  const [
    totalAllRes,
    totalYearRes,
    uncategorizedRes,
    entriesForBalances,
    lastImport,
  ] = await Promise.all([
    fetchEntriesFilteredTotals({
      search: '',
      fromDate: '',
      fromTime: '',
      toDate: '',
      toTime: '',
      onlyWithoutAccount: false,
      accountCode: '',
      ivaFilter: '',
    }),
    fetchEntriesFilteredTotals({
      search: '',
      fromDate,
      fromTime: '00:00',
      toDate,
      toTime: '23:59',
      onlyWithoutAccount: false,
      accountCode: '',
      ivaFilter: '',
    }),
    supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .or('nature.is.null,nature.eq.'),
    fetchAllEntriesPaged({
      select: 'method, amount_in, amount_out, id_key, operation_datetime',
    }),
    fetchLastSumupImport(),
  ])

  if (uncategorizedRes.error) throw uncategorizedRes.error

  const vatPeriod = await fetchIvaSummary({
    fromDate,
    toDate,
  })

  const cashBalance = sumBalanceByMethod(entriesForBalances, (method) => {
    return normalizeMethod(method) === 'contanti'
  })

  const bankBalance = sumBalanceByMethod(entriesForBalances, (method) => {
    return normalizeMethod(method) !== 'contanti'
  })

  const allAccountsBalance = sumEntriesBalance(entriesForBalances)
  const otherAccountsBalance = 0
  const negativeCashAccountsCount = 0

  return {
    totalBalance: normalizeNumber(totalAllRes?.saldo),
    yearIncome: normalizeNumber(totalYearRes?.total_in),
    yearExpense: normalizeNumber(totalYearRes?.total_out),
    vatDebit: normalizeNumber(vatPeriod?.vatDebit),
    vatCredit: normalizeNumber(vatPeriod?.vatCredit),
    uncategorizedEntriesCount: uncategorizedRes.count || 0,
    negativeCashAccountsCount,
    cashBalance,
    bankBalance,
    otherAccountsBalance,
    lastSumupImportAt: lastImport?.created_at || null,
    lastSumupImportLabel: formatDateTimeLabel(lastImport?.created_at),
    lastSumupImportRows: Number(lastImport?.imported_rows || 0),
    yearFromDate: fromDate,
    yearToDate: toDate,
    allAccountsBalance,
  }
}

export async function fetchRendicontoGestionale({ fromDate, toDate }) {
  const currentRows = await fetchAllEntriesPaged({ fromDate, toDate })
  const current = buildStatement(currentRows)

  const comparisonFromDate = fromDate ? dayjs(fromDate).subtract(1, 'year').format('YYYY-MM-DD') : null
  const comparisonToDate = toDate ? dayjs(toDate).subtract(1, 'year').format('YYYY-MM-DD') : null

  const comparisonRows =
    comparisonFromDate && comparisonToDate
      ? await fetchAllEntriesPaged({
          fromDate: comparisonFromDate,
          toDate: comparisonToDate,
        })
      : []

  const comparison = buildStatement(comparisonRows)

  const [financialPositionCurrent, financialPositionComparison] = await Promise.all([
    buildFinancialPosition(toDate),
    comparisonToDate ? buildFinancialPosition(comparisonToDate) : Promise.resolve({
      total: 0,
      cashBalance: 0,
      bankBalance: 0,
      portfolioBalance: 0,
    }),
  ])

  return {
    rows: current.rows,
    summary: current.summary,
    statement: current.statement,
    comparison: {
      fromDate: comparisonFromDate,
      toDate: comparisonToDate,
      summary: comparison.summary,
      statement: comparison.statement,
    },
    financialPosition: {
      current: financialPositionCurrent,
      comparison: financialPositionComparison,
    },
    meta: {
      fromDate,
      toDate,
      comparisonFromDate,
      comparisonToDate,
      criteriaNote:
        'Riclassificazione gestionale effettuata con regole coerenti e verificabili basate su descrizione, conto e natura del movimento. Consigliata validazione finale del consulente fiscale.',
    },
  }
}

export async function fetchIvaSummary({ fromDate, toDate }) {
  let query = supabase
    .from('entries')
    .select(`
      id,
      date,
      operation_datetime,
      description,
      amount_in,
      amount_out,
      account_code,
      nature,
      vat_rate,
      vat_amount,
      vat_side,
      id_key
    `)
    .gt('vat_amount', 0)

  if (fromDate) {
    query = query.gte('operation_datetime', `${fromDate}T00:00:00`)
  }

  if (toDate) {
    query = query.lte('operation_datetime', `${toDate}T23:59:59`)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data || []).map((row) => ({
    ...row,
    vat_amount: normalizeNumber(row.vat_amount),
    amount_in: normalizeNumber(row.amount_in),
    amount_out: normalizeNumber(row.amount_out),
    dateLabel: formatDateLabel(row.operation_datetime || row.date),
  }))

  const vatDebit = rows
    .filter((row) => String(row.vat_side || '').trim().toLowerCase() === 'debito')
    .reduce((acc, row) => acc + row.vat_amount, 0)

  const vatCredit = rows
    .filter((row) => String(row.vat_side || '').trim().toLowerCase() === 'credito')
    .reduce((acc, row) => acc + row.vat_amount, 0)

  return {
    rows,
    vatDebit,
    vatCredit,
    balance: vatDebit - vatCredit,
  }
}

export async function fetchIvaScadenziario({
  fromDate,
  toDate,
  periodicity = 'quarterly',
}) {
  const iva = await fetchIvaSummary({ fromDate, toDate })
  const buckets = new Map()

  for (const row of iva.rows) {
    const refDate = row.operation_datetime || row.date
    const d = dayjs(refDate)

    const key =
      periodicity === 'monthly'
        ? `${d.year()}-${String(d.month() + 1).padStart(2, '0')}`
        : `${d.year()}-Q${Math.floor(d.month() / 3) + 1}`

    const label =
      periodicity === 'monthly'
        ? d.format('MM/YYYY')
        : `Q${Math.floor(d.month() / 3) + 1} ${d.year()}`

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label,
        vatDebit: 0,
        vatCredit: 0,
        balance: 0,
        rows: [],
      })
    }

    const item = buckets.get(key)
    const side = String(row.vat_side || '').trim().toLowerCase()

    if (side === 'debito') item.vatDebit += row.vat_amount
    if (side === 'credito') item.vatCredit += row.vat_amount
    item.rows.push(row)
  }

  const periods = Array.from(buckets.values())
    .map((item) => ({
      ...item,
      balance: item.vatDebit - item.vatCredit,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  return {
    periodicity,
    periods,
    totals: {
      vatDebit: periods.reduce((acc, item) => acc + item.vatDebit, 0),
      vatCredit: periods.reduce((acc, item) => acc + item.vatCredit, 0),
      balance: periods.reduce((acc, item) => acc + item.balance, 0),
    },
  }
}
