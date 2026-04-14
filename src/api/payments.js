// usa lo stesso import che hai già in src/api/entries.js
import { supabase } from './supabase'
import dayjs from 'dayjs'

export function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

export async function fetchRegisteredPayments({
  search = '',
  category = 'all',
  month = '',
  page = 1,
  pageSize = 1000,
}) {
  const fromIndex = (page - 1) * pageSize
  const toIndex = fromIndex + pageSize - 1

  let query = supabase
    .from('entries')
    .select('*', { count: 'exact' })
    .gt('amount_out', 0)
    .order('operation_datetime', { ascending: false, nullsFirst: false })
    .order('id_key', { ascending: false })
    .range(fromIndex, toIndex)

  if (month) {
    const fromDate = `${month}-01`
    const toDate = dayjs(fromDate).add(1, 'month').format('YYYY-MM-DD')

    query = query.gte('date', fromDate).lt('date', toDate)
  }

  if (search.trim()) {
    const q = search.trim()
    query = query.or(
      `description.ilike.%${q}%,note.ilike.%${q}%,source.ilike.%${q}%`
    )
  }

  const { data, error, count } = await query

  if (error) throw new Error(error.message || 'Errore caricamento pagamenti')

  let rows = data || []

  if (category !== 'all') {
    rows = rows.filter((row) => mapEntryToPaymentCategory(row) === category)
  }

  return {
    rows,
    total: count || 0,
    page,
    pageSize,
  }
}

export async function fetchRegisteredPaymentsSummary({ month = '' } = {}) {
  let query = supabase
    .from('entries')
    .select('amount_out, description, note, source, date')
    .gt('amount_out', 0)

  if (month) {
    const fromDate = `${month}-01`
    const toDate = dayjs(fromDate).add(1, 'month').format('YYYY-MM-DD')
    query = query.gte('date', fromDate).lt('date', toDate)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Errore riepilogo pagamenti')

  const rows = data || []
  const total = rows.reduce((sum, row) => sum + Number(row.amount_out || 0), 0)

  return {
    total,
    count: rows.length,
  }
}

export async function fetchPaymentScheduleRules() {
  const { data, error } = await supabase
    .from('payment_schedule_rules')
    .select('*')
    .order('title', { ascending: true })

  if (error) throw new Error(error.message || 'Errore caricamento scadenziario')
  return data || []
}

export async function createPaymentScheduleRule(payload) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw new Error(authError.message || 'Errore autenticazione')
  if (!user) throw new Error('Utente non autenticato')

  const { data, error } = await supabase
    .from('payment_schedule_rules')
    .insert([{ ...payload, user_id: user.id }])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore creazione scadenza')
  return data
}

export async function updatePaymentScheduleRule(id, payload) {
  const { data, error } = await supabase
    .from('payment_schedule_rules')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore modifica scadenza')
  return data
}

export async function deletePaymentScheduleRule(id) {
  const { error } = await supabase
    .from('payment_schedule_rules')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Errore eliminazione scadenza')
}

export async function fetchPaymentScheduleSkips(month) {
  const monthDate = `${month}-01`

  const { data, error } = await supabase
    .from('payment_schedule_skips')
    .select('*')
    .eq('skip_month', monthDate)

  if (error) throw new Error(error.message || 'Errore caricamento mesi saltati')
  return data || []
}

export async function skipPaymentScheduleMonth({ ruleId, month, reason = '' }) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw new Error(authError.message || 'Errore autenticazione')
  if (!user) throw new Error('Utente non autenticato')

  const { data, error } = await supabase
    .from('payment_schedule_skips')
    .insert([
      {
        rule_id: ruleId,
        user_id: user.id,
        skip_month: `${month}-01`,
        reason: reason || null,
      },
    ])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore annullamento mensilità')
  return data
}

export async function unskipPaymentScheduleMonth({ ruleId, month }) {
  const { error } = await supabase
    .from('payment_schedule_skips')
    .delete()
    .eq('rule_id', ruleId)
    .eq('skip_month', `${month}-01`)

  if (error) throw new Error(error.message || 'Errore ripristino mensilità')
}

export function buildScheduleRows(rules = [], skips = [], month = '') {
  const skipMap = new Map(
    (skips || []).map((item) => [`${item.rule_id}_${item.skip_month}`, item])
  )

  const monthDate = dayjs(`${month}-01`)

  return (rules || []).map((rule) => {
    const dueDate = monthDate.date(rule.due_day).format('YYYY-MM-DD')
    const key = `${rule.id}_${monthDate.format('YYYY-MM-DD')}`
    const skipped = skipMap.get(key)

    return {
      ...rule,
      due_date: dueDate,
      is_skipped: !!skipped,
      skip_reason: skipped?.reason || '',
    }
  })
}

export function mapEntryToPaymentCategory(entry) {
  const text = `${entry?.description || ''} ${entry?.note || ''}`.toLowerCase()

  if (text.includes('affitto')) return 'Affitto'
  if (
    text.includes('pulizia') ||
    text.includes('pulizie') ||
    text.includes('impresa di pulizie')
  ) {
    return 'Pulizie'
  }
  if (text.includes('luce') || text.includes('gas') || text.includes('acqua')) {
    return 'Utenze'
  }
  if (text.includes('fornit')) return 'Fornitori'

  return 'Varie'
}