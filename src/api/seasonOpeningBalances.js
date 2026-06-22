import { supabase } from './supabase'

function normalizeNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function isMissingOpeningBalanceTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  const code = String(error?.code || '').toUpperCase()

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('season_opening_balances') ||
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
  )
}

export function emptySeasonOpeningBalance(academicYear = '') {
  return {
    academicYear,
    openingBalance: 0,
    openingCashBalance: 0,
    openingBankBalance: 0,
    note: '',
    isConfigured: false,
  }
}

export async function fetchSeasonOpeningBalance({ academicYear, userId = null }) {
  if (!academicYear) return emptySeasonOpeningBalance('')

  try {
    let query = supabase
      .from('season_opening_balances')
      .select('academic_year, opening_balance, opening_cash_balance, opening_bank_balance, note, user_id, created_at')
      .eq('academic_year', academicYear)

    if (userId) {
      query = query.or(`user_id.is.null,user_id.eq.${userId}`)
    } else {
      query = query.is('user_id', null)
    }

    const { data, error } = await query
      .order('user_id', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      if (isMissingOpeningBalanceTableError(error)) {
        return emptySeasonOpeningBalance(academicYear)
      }

      throw error
    }

    const row = Array.isArray(data) ? data[0] : null

    if (!row) return emptySeasonOpeningBalance(academicYear)

    return {
      academicYear: row.academic_year || academicYear,
      openingBalance: normalizeNumber(row.opening_balance),
      openingCashBalance: normalizeNumber(row.opening_cash_balance),
      openingBankBalance: normalizeNumber(row.opening_bank_balance),
      note: row.note || '',
      isConfigured: true,
    }
  } catch (error) {
    if (isMissingOpeningBalanceTableError(error)) {
      return emptySeasonOpeningBalance(academicYear)
    }

    throw new Error(error.message || 'Errore caricamento capitale iniziale stagione')
  }
}
