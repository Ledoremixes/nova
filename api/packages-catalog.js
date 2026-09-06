import { createClient } from '@supabase/supabase-js'
import { COURSE_PRICE_LIST, enrichPackagePricingMetadata } from '../src/lib/coursePriceList.js'

const SECTION_KEY = 'pagamenti'
const LIST_KEY = 'pacchetti_corsi'
const DEFAULT_PACKAGES = COURSE_PRICE_LIST.map((item) => ({ ...item, attivo: true }))

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.status(status).json(payload)
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function novaAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw Object.assign(new Error('Configura SUPABASE_SERVICE_ROLE_KEY.'), { status: 503 })
  return client(url, key)
}

async function requireNovaOperator(req, nova) {
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

function metadata(payload) {
  const tipo = payload.tipo || 'mensile'
  return JSON.stringify({
    schema: 1,
    tipo,
    durata_mesi: tipo === 'gettone' ? 1 : Math.max(1, Number(payload.durata_mesi || 1)),
    prezzo: Math.max(0, Number(payload.prezzo || 0)),
    descrizione: String(payload.descrizione || '').trim(),
    pricing_key: payload.pricing_key || null,
    pricing_group: payload.pricing_group || null,
    pricing_period: payload.pricing_period || null,
  })
}

function parse(row = {}) {
  let value = {}
  try { value = JSON.parse(row.value || '{}') } catch { value = {} }
  return enrichPackagePricingMetadata({
    id: row.id,
    nome: row.label || 'Pacchetto',
    tipo: value.tipo || 'mensile',
    durata_mesi: value.tipo === 'gettone' ? 1 : Math.max(1, Number(value.durata_mesi || 1)),
    prezzo: Math.max(0, Number(value.prezzo || 0)),
    descrizione: value.descrizione || '',
    pricing_key: value.pricing_key || null,
    pricing_group: value.pricing_group || null,
    pricing_period: value.pricing_period || null,
    attivo: row.is_active !== false,
    ordine: Number(row.sort_order || 0),
    created_at: row.created_at || null,
    updated_at: null,
  })
}

async function listRows(nova, includeInactive = true) {
  let query = nova
    .from('lookup_options')
    .select('id,label,value,sort_order,is_active,created_at')
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function seedDefaults(nova) {
  const rows = await listRows(nova, true)
  const normalized = rows.map(parse)
  const existingKeys = new Set(normalized.map((item) => item.pricing_key).filter(Boolean))
  const existingNames = new Set(normalized.map((item) => String(item.nome || '').trim().toLowerCase()))
  const missing = DEFAULT_PACKAGES.filter((item) => {
    if (existingKeys.has(item.pricing_key)) return false
    return !existingNames.has(String(item.nome || '').trim().toLowerCase())
  })

  if (!missing.length) return rows

  const { error } = await nova.from('lookup_options').insert(missing.map((item) => ({
    user_id: null,
    section_key: SECTION_KEY,
    list_key: LIST_KEY,
    label: item.nome,
    value: metadata(item),
    sort_order: item.ordine,
    is_active: true,
  })))
  if (error) {
    const afterRace = await listRows(nova, true)
    const afterKeys = new Set(afterRace.map(parse).map((item) => item.pricing_key).filter(Boolean))
    if (missing.some((item) => !afterKeys.has(item.pricing_key))) throw error
    return afterRace
  }
  return listRows(nova, true)
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Metodo non consentito' })
  try {
    const nova = novaAdmin()
    await requireNovaOperator(req, nova)

    if (req.method === 'GET') {
      const includeInactive = String(req.query?.includeInactive || 'true') !== 'false'
      const rows = await seedDefaults(nova)
      const data = rows.map(parse).filter((item) => includeInactive || item.attivo)
      return json(res, 200, { data })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const nome = String(body.nome || '').trim()
    if (req.method !== 'DELETE' && !nome) return json(res, 400, { error: 'Inserisci il nome del pacchetto.' })

    if (req.method === 'POST') {
      const { data, error } = await nova.from('lookup_options').insert([{
        user_id: null,
        section_key: SECTION_KEY,
        list_key: LIST_KEY,
        label: nome,
        value: metadata(body),
        sort_order: Number(body.ordine || 0),
        is_active: body.attivo !== false,
      }]).select('id,label,value,sort_order,is_active,created_at').single()
      if (error) throw error
      return json(res, 201, { data: parse(data) })
    }

    const id = String(body.id || '')
    if (!id) return json(res, 400, { error: 'Pacchetto non indicato.' })

    if (req.method === 'PATCH') {
      const { data, error } = await nova.from('lookup_options').update({
        label: nome,
        value: metadata(body),
        sort_order: Number(body.ordine || 0),
        is_active: body.attivo !== false,
      }).eq('id', id).eq('section_key', SECTION_KEY).eq('list_key', LIST_KEY).select('id,label,value,sort_order,is_active,created_at').single()
      if (error) throw error
      return json(res, 200, { data: parse(data) })
    }

    const { error } = await nova.from('lookup_options').delete().eq('id', id).eq('section_key', SECTION_KEY).eq('list_key', LIST_KEY)
    if (error) throw error
    return json(res, 200, { ok: true })
  } catch (error) {
    console.error('packages-catalog:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore catalogo pacchetti' })
  }
}
