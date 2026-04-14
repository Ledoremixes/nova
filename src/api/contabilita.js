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
    entriesForBalancesRes,
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
    supabase
      .from('entries')
      .select('method, amount_in, amount_out'),
    fetchLastSumupImport(),
  ])

  if (uncategorizedRes.error) throw uncategorizedRes.error
  if (entriesForBalancesRes.error) throw entriesForBalancesRes.error

  const entriesForBalances = entriesForBalancesRes.data || []

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
      method,
      center,
      note,
      source,
      nature,
      vat_rate,
      vat_amount,
      vat_side,
      id_key
    `)
    .order('operation_datetime', { ascending: false, nullsFirst: false })
    .order('id_key', { ascending: false })

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
    amount_in: normalizeNumber(row.amount_in),
    amount_out: normalizeNumber(row.amount_out),
    saldo: normalizeNumber(row.amount_in) - normalizeNumber(row.amount_out),
    dateLabel: formatDateLabel(row.operation_datetime || row.date),
  }))

  const istituzionale = rows.filter(
    (row) => String(row.nature || '').trim().toLowerCase() === 'istituzionale'
  )
  const commerciale = rows.filter(
    (row) => String(row.nature || '').trim().toLowerCase() === 'commerciale'
  )
  const nonClassificate = rows.filter((row) => {
    const n = String(row.nature || '').trim().toLowerCase()
    return !n
  })

  return {
    rows,
    summary: {
      istituzionale: buildSectionSummary(istituzionale),
      commerciale: buildSectionSummary(commerciale),
      nonClassificate: buildSectionSummary(nonClassificate),
      totale: buildSectionSummary(rows),
    },
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