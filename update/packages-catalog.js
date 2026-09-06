import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.status(status).json(payload)
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireNovaOperator(req) {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const novaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!novaUrl || !novaKey) throw Object.assign(new Error('Configura SUPABASE_SERVICE_ROLE_KEY su Vercel.'), { status: 503 })

  const nova = client(novaUrl, novaKey)
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw Object.assign(new Error('Sessione mancante.'), { status: 401 })

  const { data, error } = await nova.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('Sessione non valida.'), { status: 401 })

  let profile = (await nova.from('users').select('role,is_active,email').eq('id', data.user.id).maybeSingle()).data
  if (!profile && data.user.email) {
    profile = (await nova.from('users').select('role,is_active,email').ilike('email', data.user.email).maybeSingle()).data
  }

  const role = String(profile?.role || '').toLowerCase()
  if (!profile || !['admin', 'user'].includes(role) || profile.is_active === false) {
    throw Object.assign(new Error('Operatore Nova non autorizzato.'), { status: 403 })
  }
}

function orchideaAdmin() {
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw Object.assign(new Error('Configura ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel.'), { status: 503 })
  return client(url, key)
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return json(res, 405, { error: 'Metodo non consentito' })
  }

  try {
    await requireNovaOperator(req)
    const admin = orchideaAdmin()

    if (req.method === 'GET') {
      const includeInactive = String(req.query?.includeInactive || 'true') !== 'false'
      let query = admin
        .from('nova_packages_catalog')
        .select('*')
        .order('ordine', { ascending: true })
        .order('nome', { ascending: true })

      if (!includeInactive) query = query.eq('attivo', true)

      const { data, error } = await query
      if (error) throw error

      // Risposta esplicita e stabile: il client supporta sia questa forma sia la vecchia array pura.
      return json(res, 200, { data: Array.isArray(data) ? data : [] })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    if (req.method === 'POST') {
      const row = {
        ...body,
        id: body.id || randomUUID(),
        updated_at: new Date().toISOString(),
      }
      delete row.created_at

      const { data, error } = await admin
        .from('nova_packages_catalog')
        .insert([row])
        .select('*')
        .single()

      if (error) throw error
      return json(res, 201, { data })
    }

    const id = String(body.id || '')
    if (!id) return json(res, 400, { error: 'Pacchetto non indicato.' })

    if (req.method === 'PATCH') {
      const { id: _id, created_at: _created, ...row } = body
      row.updated_at = new Date().toISOString()

      const { data, error } = await admin
        .from('nova_packages_catalog')
        .update(row)
        .eq('id', id)
        .select('*')
        .single()

      if (error) throw error
      return json(res, 200, { data })
    }

    const { error } = await admin.from('nova_packages_catalog').delete().eq('id', id)
    if (error) throw error
    return json(res, 200, { ok: true })
  } catch (error) {
    console.error('packages-catalog:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore catalogo pacchetti' })
  }
}
