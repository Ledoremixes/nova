import dayjs from 'dayjs'

export const FIRST_FINANCIAL_YEAR = 2025
export const FIRST_FINANCIAL_DATE = '2025-06-06'

export function getFinancialYearRange(year, { limitToToday = false } = {}) {
  const normalizedYear = Number(year)
  const fromDate = normalizedYear === FIRST_FINANCIAL_YEAR
    ? FIRST_FINANCIAL_DATE
    : `${normalizedYear}-01-01`
  const fullToDate = `${normalizedYear}-12-31`
  const today = dayjs().format('YYYY-MM-DD')

  return {
    year: normalizedYear,
    fromDate,
    fullToDate,
    toDate: limitToToday && dayjs(fullToDate).isAfter(today) ? today : fullToDate,
  }
}

export function getCurrentFinancialYear() {
  return dayjs().year()
}

export function buildFinancialYearOptions(records = []) {
  const currentYear = getCurrentFinancialYear()
  const recordYears = records.map((item) => Number(item.year)).filter(Number.isFinite)
  const lastYear = Math.max(currentYear + 1, FIRST_FINANCIAL_YEAR, ...recordYears)

  return Array.from(
    { length: lastYear - FIRST_FINANCIAL_YEAR + 1 },
    (_, index) => FIRST_FINANCIAL_YEAR + index
  ).reverse()
}

export function getFinancialPeriod(selection, customFromDate = '', customToDate = '') {
  const today = dayjs().format('YYYY-MM-DD')

  if (selection === 'all') {
    return {
      mode: 'all',
      year: null,
      fromDate: FIRST_FINANCIAL_DATE,
      toDate: today,
      label: 'Tutti gli anni',
    }
  }

  if (selection === 'custom') {
    return {
      mode: 'custom',
      year: null,
      fromDate: customFromDate || FIRST_FINANCIAL_DATE,
      toDate: customToDate || today,
      label: 'Intervallo personalizzato',
    }
  }

  const year = Number(selection)
  const range = getFinancialYearRange(year, { limitToToday: year === getCurrentFinancialYear() })

  return {
    mode: 'year',
    year,
    fromDate: range.fromDate,
    toDate: range.toDate,
    fullToDate: range.fullToDate,
    label: `Esercizio ${year}`,
  }
}

export function financialYearForDate(value) {
  const date = dayjs(value)
  return date.isValid() ? date.year() : null
}

export function isFinancialYearClosed(records = [], year) {
  return records.some((item) => Number(item.year) === Number(year) && item.status === 'closed')
}

export function isDateInClosedFinancialYear(value, records = []) {
  const year = financialYearForDate(value)
  return year ? isFinancialYearClosed(records, year) : false
}
