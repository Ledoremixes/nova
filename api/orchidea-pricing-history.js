import { createClient } from '@supabase/supabase-js'

function json(res, status, payload) {
  res.status(status).json(payload)
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function clean(value) {
  return String(value ?? '').trim()
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

  return { user: data.user, role, profile }
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

function moneyOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })

  try {
    const operator = await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    const enrollmentId = clean(body.enrollment_id)
    const studentId = clean(body.tesseramento_id)
    const courseId = clean(body.corso_id) || null
    const effectiveFrom = clean(body.effective_from)

    if (!enrollmentId || !studentId || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return json(res, 400, { error: 'Dati storico prezzo incompleti.' })
    }

    const payload = {
      enrollment_id: enrollmentId,
      tesseramento_id: studentId,
      corso_id: courseId,
      effective_from: effectiveFrom,
      quota_allievo_mensile: moneyOrNull(body.quota_allievo_mensile) ?? 0,
      pacchetto_nome: clean(body.pacchetto_nome) || null,
      pacchetto_totale_mensile: moneyOrNull(body.pacchetto_totale_mensile),
      note_pacchetto: clean(body.note_pacchetto) || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await orchidea
      .from('nova_package_pricing_history')
      .upsert(payload, { onConflict: 'enrollment_id,effective_from' })
      .select('*')
      .single()

    if (error) throw error

    console.info('nova pricing history write', {
      operator: operator.user?.email || operator.user?.id,
      enrollment_id: enrollmentId,
      tesseramento_id: studentId,
      effective_from: effectiveFrom,
    })

    return json(res, 200, { item: data })
  } catch (error) {
    console.error('orchidea-pricing-history:', error)
    return json(res, error?.status || 500, {
      error: error?.status && error.status < 500
        ? error.message
        : 'Non riesco a salvare lo storico prezzo. Riprova tra pochi secondi.',
    })
  }
}
