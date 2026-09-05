import { createClient } from '@supabase/supabase-js'

function json(res, status, payload) { res.status(status).json(payload) }
function client(url, key) { return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }

async function requireNovaAdmin(req) {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const novaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!novaUrl || !novaKey) throw Object.assign(new Error('Configura SUPABASE_SERVICE_ROLE_KEY su Vercel.'), { status: 503 })
  const nova = client(novaUrl, novaKey)
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw Object.assign(new Error('Sessione mancante.'), { status: 401 })
  const { data, error } = await nova.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('Sessione non valida.'), { status: 401 })
  let { data: profile } = await nova.from('users').select('role,is_active,email').eq('id', data.user.id).maybeSingle()
  if (!profile && data.user.email) profile = (await nova.from('users').select('role,is_active,email').ilike('email', data.user.email).maybeSingle()).data
  if (!profile || String(profile.role || '').toLowerCase() !== 'admin' || profile.is_active === false) throw Object.assign(new Error('Operazione riservata agli admin.'), { status: 403 })
}

async function findByEmail(admin, email) {
  const wanted = String(email || '').trim().toLowerCase()
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })
  try {
    await requireNovaAdmin(req)
    const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    const key = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!url || !key) throw Object.assign(new Error('Configura ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel.'), { status: 503 })
    const orchidea = client(url, key)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const password = String(body.password || '')
    if (password.length < 6) return json(res, 400, { error: 'La password deve avere almeno 6 caratteri.' })
    let userId = String(body.user_id || '')
    if (!userId) {
      const user = await findByEmail(orchidea, body.email)
      userId = user?.id || ''
    }
    if (!userId) return json(res, 404, { error: 'Account Auth del corsista non trovato tramite auth_user_id o email.' })
    const { data, error } = await orchidea.auth.admin.updateUserById(userId, { password })
    if (error) throw error
    return json(res, 200, { ok: true, user_id: data.user.id, email: data.user.email })
  } catch (error) {
    console.error('orchidea-auth-users:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore aggiornamento password corsista' })
  }
}
