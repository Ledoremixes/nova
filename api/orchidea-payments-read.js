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

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Metodo non consentito' })

  try {
    await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()

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
    console.error('orchidea-payments-read:', error)
    return json(res, error?.status || 500, {
      error: error?.status && error.status < 500
        ? error.message
        : 'Non riesco a leggere l’archivio pagamenti Orchidea. Riprova tra pochi secondi.',
    })
  }
}
