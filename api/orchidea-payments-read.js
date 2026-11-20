import { createClient } from '@supabase/supabase-js'

function json(res, status, payload) {
  res.status(status).json(payload)
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireNovaOperator(req) {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const novaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!novaUrl || !novaKey) {
    throw Object.assign(new Error('Configurazione server Nova incompleta.'), { status: 503 })
  }

  const nova = client(novaUrl, novaKey)
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw Object.assign(new Error('Sessione Nova mancante.'), { status: 401 })

  const { data, error } = await nova.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('Sessione Nova non valida.'), { status: 401 })

  let { data: profile } = await nova
    .from('users')
    .select('role,is_active,email')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile && data.user.email) {
    profile = (await nova
      .from('users')
      .select('role,is_active,email')
      .ilike('email', data.user.email)
      .maybeSingle()).data
  }

  const role = String(profile?.role || '').trim().toLowerCase()
  if (!profile || !['admin', 'user'].includes(role) || profile.is_active === false) {
    throw Object.assign(new Error('Operazione non consentita a questo utente.'), { status: 403 })
  }

  return { user: data.user, role }
}

function orchideaAdminClient() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const orchideaUrl = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const dedicatedKey = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || ''
  const sharedNovaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const orchideaKey = dedicatedKey || (orchideaUrl && orchideaUrl === novaUrl ? sharedNovaKey : '')

  if (!orchideaUrl || !orchideaKey) {
    throw Object.assign(new Error('Configurazione server Orchidea incompleta.'), { status: 503 })
  }

  return client(orchideaUrl, orchideaKey)
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_COLUMNS = new Set([
  'id','tesseramento_id','descrizione','importo','periodo','scadenza','stato','metodo','pagato_il',
  'sumup_checkout_id','sumup_payment_url','created_at','corso_id','iscrizione_id','tipo_quota',
  'billing_cycle','periodo_inizio','periodo_fine','copertura_mesi','note','updated_at',
  'pacchetto_id','pacchetto_nome','pacchetto_totale_mensile','quota_pacchetto_percentuale',
  'tipo','mese','data_pagamento','nova_package_id','nova_package_name','nova_package_type',
  'nova_package_total','nova_package_duration_months','nova_payment_group_id',
  'nova_coverage_from','nova_coverage_to','nova_coverage_complete','nova_cash_amount'
])
const FILTER_COLUMNS = new Set(['id','tesseramento_id','periodo','tipo','mese','scadenza','created_at','updated_at','stato'])
const allowedOr = /^periodo\.eq\.\d{4}-\d{2},and\(mese\.gte\.\d{4}-\d{2}-\d{2},mese\.lte\.\d{4}-\d{2}-\d{2}\),and\(scadenza\.gte\.\d{4}-\d{2}-\d{2},scadenza\.lte\.\d{4}-\d{2}-\d{2}\)$/
function badPaymentRequest(message) {
  throw Object.assign(new Error(message), { status: 400 })
}
async function handlePaymentGateway(req, res, orchidea) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
  const operation = String(body.operation || '').trim()
  if (!['select', 'insert', 'update', 'delete'].includes(operation)) badPaymentRequest('Operazione non valida.')
  const payload = body.payload
  const filters = Array.isArray(body.filters) ? body.filters : []
  if (filters.length > 8) badPaymentRequest('Troppi filtri.')
  const select = String(body.columns || '*').trim()
  if (select !== '*' && (!/^[a-z_]+(?:,\s*[a-z_]+)*$/.test(select) || select.split(',').some(col => !PAYMENT_COLUMNS.has(col.trim())))) {
    badPaymentRequest('Selezione campi non valida.')
  }
  if (JSON.stringify(body).length > 70000) badPaymentRequest('Richiesta troppo grande.')
  const cleanPayload = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) badPaymentRequest('Dati pagamento non validi.')
    if (Object.keys(value).some(col => !PAYMENT_COLUMNS.has(col))) badPaymentRequest('Campi pagamento non consentiti.')
    return value
  }
  let query
  if (operation === 'select') {
    query = orchidea.from('pagamenti').select(select)
  } else if (operation === 'insert') {
    const rows = Array.isArray(payload) ? payload : [payload]
    if (!rows.length || rows.length > 20) badPaymentRequest('Numero pagamenti non valido.')
    for (const row of rows) {
      cleanPayload(row)
      if (!UUID_RE.test(row.tesseramento_id || '')) badPaymentRequest('Tesserato non valido.')
    }
    query = orchidea.from('pagamenti').insert(rows)
    if (body.returning) query = query.select(select)
  } else {
    const ids = filters.filter(f => f?.op === 'eq' && f?.column === 'id')
    if (ids.length !== 1 || !UUID_RE.test(String(ids[0]?.value || ''))) {
      badPaymentRequest('Per modificare o eliminare un pagamento è richiesto il suo ID.')
    }
    if (operation === 'update') {
      query = orchidea.from('pagamenti').update(cleanPayload(payload))
    } else {
      query = orchidea.from('pagamenti').delete()
    }
    if (body.returning) query = query.select(select)
  }
  for (const f of filters) {
    if (!f || typeof f !== 'object') badPaymentRequest('Filtro mancante.')
    if (f.op === 'or') {
      if (operation !== 'select' || !allowedOr.test(String(f.value || ''))) badPaymentRequest('Filtro temporale non valido.')
      query = query.or(f.value)
    } else if (f.op === 'in') {
      if (!FILTER_COLUMNS.has(f.column) || !Array.isArray(f.value) || f.value.length > 24 || f.value.some(v => typeof v !== 'string' || v.length > 80)) badPaymentRequest('Filtro elenco non valido.')
      query = query.in(f.column, f.value)
    } else if (f.op === 'eq' || f.op === 'gte' || f.op === 'lte') {
      if (!FILTER_COLUMNS.has(f.column) || !['string','number','boolean'].includes(typeof f.value) || String(f.value).length > 100) badPaymentRequest('Filtro non valido.')
      query = query[f.op](f.column, f.value)
    } else {
      badPaymentRequest('Operatore filtro non consentito.')
    }
  }
  if (body.order) {
    if (operation !== 'select' || !FILTER_COLUMNS.has(body.order.column)) badPaymentRequest('Ordinamento non valido.')
    query = query.order(body.order.column, { ascending: body.order.ascending !== false, nullsFirst: body.order.nullsFirst === true })
  }
  if (body.limit) {
    if (operation !== 'select' || !Number.isInteger(body.limit) || body.limit > 20000 || body.limit < 1) badPaymentRequest('Limite non valido.')
    query = query.limit(body.limit)
  }
  if (body.single === 'single') query = query.single()
  else if (body.single === 'maybeSingle') query = query.maybeSingle()
  const { data, error } = await query
  if (error) {
    console.error('nova payments gateway DB error', error.code)
    return json(res, 409, { ok:false, code:error.code || '', error:error.message || 'Errore database.' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return json(res, 200, { ok:true, data: data ?? null })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })

  try {
    await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()
    if (req.method === 'POST') return await handlePaymentGateway(req, res, orchidea)

    // Lo storico e' consultabile solo da operatori Nova autenticati. I log
    // completi rimangono nel database e non sono esposti alle sessioni allievi.
    if (String(req.query?.history || '') === '1') {
      const historyStudentId = String(req.query?.studentId || '').trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(historyStudentId)) {
        return json(res, 400, { error: 'Seleziona un allievo valido per lo storico.' })
      }
      const { data: changes, error: historyError } = await orchidea
        .from('nova_payment_change_history')
        .select('id,payment_id,periodo,event_type,changed_at,actor_email,actor_role,old_data,new_data')
        .eq('tesseramento_id', historyStudentId)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(150)
      if (historyError) throw historyError

      const paymentState = (row) => row ? ({
        importo: row.importo,
        stato: row.stato,
        metodo: row.metodo,
        note: row.note,
        descrizione: row.descrizione,
        periodo: row.periodo,
        tipo: row.tipo,
        billing_cycle: row.billing_cycle,
        copertura_mesi: row.copertura_mesi,
        periodo_inizio: row.periodo_inizio,
        periodo_fine: row.periodo_fine,
        nova_package_name: row.nova_package_name,
        nova_package_type: row.nova_package_type,
        nova_package_total: row.nova_package_total,
        nova_package_duration_months: row.nova_package_duration_months,
        nova_coverage_from: row.nova_coverage_from,
        nova_coverage_to: row.nova_coverage_to,
        nova_cash_amount: row.nova_cash_amount,
        pacchetto_nome: row.pacchetto_nome,
      }) : null
      return json(res, 200, {
        ok: true,
        history: (changes || []).map((item) => ({
          id: item.id,
          payment_id: item.payment_id,
          periodo: item.periodo,
          event_type: item.event_type,
          changed_at: item.changed_at,
          actor_email: item.actor_email,
          actor_role: item.actor_role,
          before: paymentState(item.old_data),
          after: paymentState(item.new_data),
        })),
      })
    }

    const month = String(req.query?.month || '').slice(0, 7)
    const studentId = String(req.query?.studentId || '').trim()
    const monthStart = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : ''
    const monthEnd = monthStart
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toISOString().slice(0, 10)
      : ''

    let paymentsQuery = orchidea
      .from('pagamenti')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(studentId ? 1000 : monthStart ? 5000 : 20000)

    if (studentId) paymentsQuery = paymentsQuery.eq('tesseramento_id', studentId)
    if (monthStart) {
      paymentsQuery = paymentsQuery.or(`periodo.eq.${month},and(mese.gte.${monthStart},mese.lte.${monthEnd}),and(scadenza.gte.${monthStart},scadenza.lte.${monthEnd})`)
    }

    let pricingQuery = orchidea
      .from('nova_package_pricing_history')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(studentId ? 1000 : monthStart ? 10000 : 20000)

    if (studentId) pricingQuery = pricingQuery.eq('tesseramento_id', studentId)
    if (monthEnd) pricingQuery = pricingQuery.lte('effective_from', monthEnd)

    const [paymentsRes, pricingHistoryRes] = await Promise.all([paymentsQuery, pricingQuery])

    if (paymentsRes.error) throw paymentsRes.error

    return json(res, 200, {
      ok: true,
      payments: paymentsRes.data || [],
      pricingHistory: pricingHistoryRes.error ? [] : (pricingHistoryRes.data || []),
    })
  } catch (error) {
    console.error('orchidea-payments-read:', error?.message)
    return json(res, error?.status || 500, {
      error: error?.status && error.status < 500
        ? error.message
        : 'Servizio pagamenti temporaneamente non disponibile. Nessuna modifica confermata.',
    })
  }
}
