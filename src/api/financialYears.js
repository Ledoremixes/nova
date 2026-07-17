import { supabase } from './supabase'
import { getFinancialYearRange } from '../lib/financialYear'

function normalizeNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

export function isMissingFinancialYearsTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toUpperCase()

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('financial_years') && (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('schema cache')
    )
  )
}

function isMissingFinancialYearFeatureError(error) {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toUpperCase()

  return isMissingFinancialYearsTableError(error) || (
    code === 'PGRST202' && message.includes('financial_year')
  )
}

export function normalizeFinancialYearRecord(row, year = null) {
  const normalizedYear = Number(row?.year || year)
  const range = getFinancialYearRange(normalizedYear)

  return {
    id: row?.id || null,
    year: normalizedYear,
    startsOn: row?.starts_on || range.fromDate,
    endsOn: row?.ends_on || range.fullToDate,
    status: row?.status || 'open',
    openingCashBalance: normalizeNumber(row?.opening_cash_balance),
    openingBankBalance: normalizeNumber(row?.opening_bank_balance),
    openingReceivables: normalizeNumber(row?.opening_receivables),
    openingPayables: normalizeNumber(row?.opening_payables),
    currentReceivables: normalizeNumber(row?.current_receivables ?? row?.opening_receivables),
    currentPayables: normalizeNumber(row?.current_payables ?? row?.opening_payables),
    closingCashBalance: row?.closing_cash_balance === null || row?.closing_cash_balance === undefined
      ? null
      : normalizeNumber(row.closing_cash_balance),
    closingBankBalance: row?.closing_bank_balance === null || row?.closing_bank_balance === undefined
      ? null
      : normalizeNumber(row.closing_bank_balance),
    closingReceivables: row?.closing_receivables === null || row?.closing_receivables === undefined
      ? null
      : normalizeNumber(row.closing_receivables),
    closingPayables: row?.closing_payables === null || row?.closing_payables === undefined
      ? null
      : normalizeNumber(row.closing_payables),
    totalIncome: normalizeNumber(row?.total_income),
    totalExpenses: normalizeNumber(row?.total_expenses),
    result: normalizeNumber(row?.result),
    closedAt: row?.closed_at || null,
    closedBy: row?.closed_by || null,
    closingNote: row?.closing_note || '',
    isConfigured: Boolean(row?.id),
  }
}

const financialYearColumns = `
  id,
  year,
  starts_on,
  ends_on,
  status,
  opening_cash_balance,
  opening_bank_balance,
  opening_receivables,
  opening_payables,
  current_receivables,
  current_payables,
  closing_cash_balance,
  closing_bank_balance,
  closing_receivables,
  closing_payables,
  total_income,
  total_expenses,
  result,
  closed_at,
  closed_by,
  closing_note,
  created_at,
  updated_at
`

export async function fetchFinancialYears() {
  const { data, error } = await supabase
    .from('financial_years')
    .select(financialYearColumns)
    .order('year', { ascending: false })

  if (error) {
    if (isMissingFinancialYearsTableError(error)) return []
    throw new Error(error.message || 'Errore caricamento esercizi finanziari')
  }

  return (data || []).map((row) => normalizeFinancialYearRecord(row))
}

export async function fetchFinancialYear(year) {
  const { data, error } = await supabase
    .from('financial_years')
    .select(financialYearColumns)
    .eq('year', Number(year))
    .maybeSingle()

  if (error) {
    if (isMissingFinancialYearsTableError(error)) return normalizeFinancialYearRecord(null, year)
    throw new Error(error.message || 'Errore caricamento esercizio finanziario')
  }

  return normalizeFinancialYearRecord(data, year)
}

export async function saveFinancialYearPosition({
  year,
  openingCashBalance = 0,
  openingBankBalance = 0,
  openingReceivables = 0,
  openingPayables = 0,
  currentReceivables = 0,
  currentPayables = 0,
}) {
  const { data, error } = await supabase.rpc('save_financial_year_position', {
    p_year: Number(year),
    p_opening_cash_balance: normalizeNumber(openingCashBalance),
    p_opening_bank_balance: normalizeNumber(openingBankBalance),
    p_opening_receivables: normalizeNumber(openingReceivables),
    p_opening_payables: normalizeNumber(openingPayables),
    p_current_receivables: normalizeNumber(currentReceivables),
    p_current_payables: normalizeNumber(currentPayables),
  })

  if (error) {
    if (isMissingFinancialYearFeatureError(error)) {
      throw new Error('Prima applica la migrazione SQL dell’anno finanziario in Supabase.')
    }
    throw normalizeRpcError(error, 'Errore salvataggio posizione finanziaria')
  }

  return normalizeFinancialYearRecord(Array.isArray(data) ? data[0] : data, year)
}

function normalizeRpcError(error, fallback) {
  const message = String(error?.message || '')
  if (message.includes('FINANCIAL_YEAR_NOT_ENDED')) {
    return new Error('L’esercizio può essere chiuso solo alla data di fine anno o successivamente.')
  }
  if (message.includes('FINANCIAL_YEAR_ALREADY_CLOSED')) {
    return new Error('Questo esercizio risulta già chiuso.')
  }
  if (message.includes('FINANCIAL_YEAR_NOT_CLOSED')) {
    return new Error('Questo esercizio non risulta chiuso.')
  }
  if (message.includes('NOVA_ADMIN_REQUIRED')) {
    return new Error('Solo un amministratore può eseguire questa operazione.')
  }
  return new Error(message || fallback)
}

export async function closeFinancialYear({
  year,
  closingCashBalance,
  closingBankBalance,
  closingReceivables,
  closingPayables,
  note = '',
}) {
  const { data, error } = await supabase.rpc('close_financial_year', {
    p_year: Number(year),
    p_closing_cash_balance: normalizeNumber(closingCashBalance),
    p_closing_bank_balance: normalizeNumber(closingBankBalance),
    p_closing_receivables: normalizeNumber(closingReceivables),
    p_closing_payables: normalizeNumber(closingPayables),
    p_note: note || null,
  })

  if (error) {
    if (isMissingFinancialYearFeatureError(error)) {
      throw new Error('Prima applica la migrazione SQL dell’anno finanziario in Supabase.')
    }
    throw normalizeRpcError(error, 'Errore chiusura esercizio')
  }

  return normalizeFinancialYearRecord(Array.isArray(data) ? data[0] : data, year)
}

export async function reopenFinancialYear(year) {
  const { data, error } = await supabase.rpc('reopen_financial_year', {
    p_year: Number(year),
  })

  if (error) {
    if (isMissingFinancialYearFeatureError(error)) {
      throw new Error('Prima applica la migrazione SQL dell’anno finanziario in Supabase.')
    }
    throw normalizeRpcError(error, 'Errore riapertura esercizio')
  }
  return normalizeFinancialYearRecord(Array.isArray(data) ? data[0] : data, year)
}
