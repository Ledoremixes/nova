import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

function json(res, status, payload) {
  res.status(status).json(payload)
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeCf(value) {
  return clean(value).replace(/\s+/g, '').toUpperCase()
}

async function requireNovaOperator(req) {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const novaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!novaUrl || !novaKey) {
    throw Object.assign(new Error('Configura SUPABASE_SERVICE_ROLE_KEY su Vercel.'), { status: 503 })
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
    throw Object.assign(
      new Error('Configura ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel per usare l’iscrizione rapida.'),
      { status: 503 },
    )
  }

  return client(orchideaUrl, orchideaKey)
}

async function findAuthByEmail(admin, email) {
  const wanted = clean(email).toLowerCase()
  if (!wanted) return null

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = (data.users || []).find((user) => String(user.email || '').toLowerCase() === wanted)
    if (found) return found
    if ((data.users || []).length < 200) break
  }
  return null
}

async function findExistingTesseramento(admin, cf, email) {
  if (cf) {
    const byCf = await admin.from('tesseramenti').select('*').eq('cf', cf).limit(1).maybeSingle()
    if (byCf.error) throw byCf.error
    if (byCf.data) return byCf.data
  }

  if (email) {
    const byEmail = await admin.from('tesseramenti').select('*').ilike('email', email).limit(1).maybeSingle()
    if (byEmail.error) throw byEmail.error
    if (byEmail.data) return byEmail.data
  }

  return null
}

async function nextMembershipNumber(admin) {
  const { data, error } = await admin.from('tesseramenti').select('numero_tessera').limit(20000)
  if (error) throw error

  const max = (data || []).reduce((highest, row) => {
    const match = String(row.numero_tessera || '').match(/^ORC-(\d+)$/i)
    const value = match ? Number(match[1]) || 0 : 0
    return Math.max(highest, value)
  }, 0)

  return `ORC-${String(max + 1).padStart(6, '0')}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })

  let createdAuthUserId = null
  let authUserWasCreated = false

  try {
    await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    const nome = clean(body.nome)
    const cognome = clean(body.cognome)
    const email = clean(body.email).toLowerCase()
    const telefono = clean(body.telefono)
    const cf = normalizeCf(body.cf)
    const nascita = clean(body.nascita) || null
    const luogo = clean(body.luogo) || null
    const residenza = clean(body.residenza) || null
    const stagione = clean(body.stagione) || '2026/2027'

    if (!nome || !cognome) return json(res, 400, { error: 'Inserisci nome e cognome.' })
    if (!email || !email.includes('@')) return json(res, 400, { error: 'Inserisci un indirizzo email valido.' })
    if (!telefono) return json(res, 400, { error: 'Inserisci il numero di telefono.' })
    if (cf.length < 6) return json(res, 400, { error: 'Inserisci il codice fiscale.' })

    const existing = await findExistingTesseramento(orchidea, cf, email)
    if (existing) {
      return json(res, 200, { ok: true, existing: true, student: existing })
    }

    let authUser = await findAuthByEmail(orchidea, email)
    if (!authUser) {
      const authResult = await orchidea.auth.admin.createUser({
        email,
        password: cf,
        email_confirm: true,
        user_metadata: { nome, cognome, source: 'nova_iscrizione_rapida' },
      })
      if (authResult.error) throw authResult.error
      authUser = authResult.data.user
      createdAuthUserId = authUser?.id || null
      authUserWasCreated = Boolean(createdAuthUserId)
    }

    const numeroTessera = await nextMembershipNumber(orchidea)
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    const payload = {
      nome,
      cognome,
      email,
      telefono,
      cf,
      nascita,
      luogo,
      residenza,
      status: 'pending_payment',
      payment_status: 'unpaid',
      valid_from: today,
      qr_token: randomUUID(),
      numero_tessera: numeroTessera,
      tessera_attiva: true,
      is_corsista: true,
      stagione,
      auth_user_id: authUser?.id || null,
      updated_at: now,
    }

    const { data, error } = await orchidea
      .from('tesseramenti')
      .insert([payload])
      .select('*')
      .single()

    if (error) throw error

    return json(res, 200, {
      ok: true,
      existing: false,
      student: data,
      first_access_password: cf,
    })
  } catch (error) {
    if (authUserWasCreated && createdAuthUserId) {
      try {
        const orchidea = orchideaAdminClient()
        await orchidea.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackError) {
        console.warn('Rollback utente Auth Orchidea non riuscito:', rollbackError?.message || rollbackError)
      }
    }

    console.error('orchidea-students:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore iscrizione rapida corsista' })
  }
}
