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

function startOfYearDate() {
  return dayjs().startOf('year').format('YYYY-MM-DD')
}

function endOfTodayDate() {
  return dayjs().format('YYYY-MM-DD')
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

async function fetchRendicontoMappings() {
  const { data, error } = await supabase
    .from('lookup_options')
    .select(`
      id,
      section_key,
      list_key,
      label,
      value,
      sort_order,
      is_active,
      report_area,
      report_bucket,
      report_row_code,
      report_row_label
    `)
    .eq('section_key', 'contabilita')
    .eq('list_key', 'conti_rendiconto')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) throw error
  return data || []
}

function buildMappingMap(mappings) {
  return new Map(
    (mappings || [])
      .filter((item) => item.value)
      .map((item) => [String(item.value).trim().toUpperCase(), item])
  )
}

function getClassificationForRow(row, mappingMap) {
  const code = String(row.account_code || '').trim().toUpperCase()
  const mapping = code ? mappingMap.get(code) : null

  if (mapping) {
    return {
      source: 'lookup',
      accountCode: code,
      accountLabel: mapping.label || code,
      reportArea: mapping.report_area || 'da_classificare',
      reportBucket: mapping.report_bucket || 'Z_DA_CLASSIFICARE',
      reportRowCode: mapping.report_row_code || null,
      reportRowLabel: mapping.report_row_label || mapping.label || code,
    }
  }

  return {
    source: 'fallback',
    accountCode: code || null,
    accountLabel: row.account_code || 'Senza conto',
    reportArea: 'da_classificare',
    reportBucket: 'Z_DA_CLASSIFICARE',
    reportRowCode: null,
    reportRowLabel: row.account_code || 'Senza conto',
  }
}

function buildSectionSummary(rows) {
  const totalIn = rows.reduce((acc, row) => acc + normalizeNumber(row.amount_in), 0)
  const totalOut = rows.reduce((acc, row) => acc + normalizeNumber(row.amount_out), 0)

  return {
    rowsCount: rows.length,
    totalIn,
    totalOut,
    saldo: totalIn - totalOut,
  }
}

function buildBucketSummary(rows, code, label) {
  const totalIn = rows.reduce((acc, row) => acc + normalizeNumber(row.amount_in), 0)
  const totalOut = rows.reduce((acc, row) => acc + normalizeNumber(row.amount_out), 0)

  return {
    code,
    label,
    rowsCount: rows.length,
    totalIn,
    totalOut,
    saldo: totalIn - totalOut,
  }
}

function aggregateRowsForPdf(rows) {
  const sectionDefinitions = {
    A_ENTRATE_ISTITUZIONALI: { side: 'in', title: 'A) Entrate da attività istituzionali' },
    A_USCITE_ISTITUZIONALI: { side: 'out', title: 'A) Uscite da attività istituzionali' },
    B_ENTRATE_SECONDARIE: { side: 'in', title: 'B) Entrate da attività secondarie e strumentali' },
    B_USCITE_SECONDARIE: { side: 'out', title: 'B) Uscite da attività secondarie e strumentali' },
    C_ENTRATE_COMMERCIALI: { side: 'in', title: 'C) Entrate da attività di raccolta fondi e attività commerciali connesse' },
    C_USCITE_COMMERCIALI: { side: 'out', title: 'C) Uscite da attività di raccolta fondi e attività commerciali connesse' },
    D_ENTRATE_FINANZIARIE: { side: 'in', title: 'D) Entrate da attività finanziarie e patrimoniali' },
    D_USCITE_FINANZIARIE: { side: 'out', title: 'D) Uscite da attività finanziarie e patrimoniali' },
    E_ENTRATE_SUPPORTO: { side: 'in', title: 'E) Entrate di supporto generale' },
    E_USCITE_SUPPORTO: { side: 'out', title: 'E) Uscite di supporto generale' },
    Z_DA_CLASSIFICARE: { side: 'mixed', title: 'Z) Voci da classificare' },
  }

  const sectionsMap = new Map()

  for (const row of rows) {
    const bucket = row.reportBucket || 'Z_DA_CLASSIFICARE'
    if (!sectionsMap.has(bucket)) {
      const config = sectionDefinitions[bucket] || sectionDefinitions.Z_DA_CLASSIFICARE
      sectionsMap.set(bucket, {
        code: bucket,
        title: config.title,
        side: config.side,
        rowsMap: new Map(),
        totalIn: 0,
        totalOut: 0,
      })
    }

    const section = sectionsMap.get(bucket)
    const rowKey = row.reportRowCode || `${bucket}:${row.reportRowLabel || row.accountCode || 'ALTRO'}`
    if (!section.rowsMap.has(rowKey)) {
      section.rowsMap.set(rowKey, {
        rowCode: row.reportRowCode || '',
        label: row.reportRowLabel || row.accountLabel || row.accountCode || 'Altro',
        totalIn: 0,
        totalOut: 0,
      })
    }

    const item = section.rowsMap.get(rowKey)
    item.totalIn += normalizeNumber(row.amount_in)
    item.totalOut += normalizeNumber(row.amount_out)
    section.totalIn += normalizeNumber(row.amount_in)
    section.totalOut += normalizeNumber(row.amount_out)
  }

  return Array.from(sectionsMap.values()).map((section) => ({
    code: section.code,
    title: section.title,
    side: section.side,
    rows: Array.from(section.rowsMap.values())
      .sort((a, b) => `${a.rowCode} ${a.label}`.localeCompare(`${b.rowCode} ${b.label}`)),
    totalIn: section.totalIn,
    totalOut: section.totalOut,
    saldo: section.totalIn - section.totalOut,
  }))
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
      select: 'method, amount_in, amount_out, operation_datetime, id_key',
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

  return {
    totalBalance: normalizeNumber(totalAllRes?.saldo),
    yearIncome: normalizeNumber(totalYearRes?.total_in),
    yearExpense: normalizeNumber(totalYearRes?.total_out),
    vatDebit: normalizeNumber(vatPeriod?.vatDebit),
    vatCredit: normalizeNumber(vatPeriod?.vatCredit),
    uncategorizedEntriesCount: uncategorizedRes.count || 0,
    negativeCashAccountsCount: 0,
    cashBalance,
    bankBalance,
    otherAccountsBalance: 0,
    lastSumupImportAt: lastImport?.created_at || null,
    lastSumupImportLabel: formatDateTimeLabel(lastImport?.created_at),
    lastSumupImportRows: Number(lastImport?.imported_rows || 0),
    yearFromDate: fromDate,
    yearToDate: toDate,
    allAccountsBalance,
  }
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

export async function fetchRendicontoGestionale({ fromDate, toDate }) {
  const [rawRows, mappings] = await Promise.all([
    fetchAllEntriesPaged({ fromDate, toDate }),
    fetchRendicontoMappings(),
  ])

  const mappingMap = buildMappingMap(mappings)

  const rows = rawRows.map((row) => {
    const classification = getClassificationForRow(row, mappingMap)

    return {
      ...row,
      ...classification,
      amount_in: normalizeNumber(row.amount_in),
      amount_out: normalizeNumber(row.amount_out),
      saldo: normalizeNumber(row.amount_in) - normalizeNumber(row.amount_out),
      dateLabel: formatDateLabel(row.operation_datetime || row.date),
    }
  })

  const istituzionale = rows.filter((row) => row.reportArea === 'istituzionale')
  const commerciale = rows.filter((row) => row.reportArea === 'commerciale')
  const finanziaria = rows.filter((row) => row.reportArea === 'finanziaria')
  const supportoGenerale = rows.filter((row) => row.reportArea === 'supporto_generale')
  const nonClassificate = rows.filter((row) => row.reportArea === 'da_classificare')

  return {
    rows,
    mappings,
    sections: aggregateRowsForPdf(rows),
    summary: {
      istituzionale: buildSectionSummary(istituzionale),
      commerciale: buildSectionSummary(commerciale),
      finanziaria: buildSectionSummary(finanziaria),
      supportoGenerale: buildSectionSummary(supportoGenerale),
      nonClassificate: buildSectionSummary(nonClassificate),
      totale: buildSectionSummary(rows),
    },
    buckets: {
      aEntrateIstituzionali: buildBucketSummary(
        rows.filter((row) => row.reportBucket === 'A_ENTRATE_ISTITUZIONALI'),
        'A_ENTRATE_ISTITUZIONALI',
        'A) Entrate da attività istituzionali'
      ),
      aUsciteIstituzionali: buildBucketSummary(
        rows.filter((row) => row.reportBucket === 'A_USCITE_ISTITUZIONALI'),
        'A_USCITE_ISTITUZIONALI',
        'A) Uscite da attività istituzionali'
      ),
      cEntrateCommerciali: buildBucketSummary(
        rows.filter((row) => row.reportBucket === 'C_ENTRATE_COMMERCIALI'),
        'C_ENTRATE_COMMERCIALI',
        'C) Entrate da attività di raccolta fondi e attività commerciali connesse'
      ),
      cUsciteCommerciali: buildBucketSummary(
        rows.filter((row) => row.reportBucket === 'C_USCITE_COMMERCIALI'),
        'C_USCITE_COMMERCIALI',
        'C) Uscite da attività di raccolta fondi e attività commerciali connesse'
      ),
      daClassificare: buildBucketSummary(
        rows.filter((row) => row.reportBucket === 'Z_DA_CLASSIFICARE'),
        'Z_DA_CLASSIFICARE',
        'Voci da classificare'
      ),
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
