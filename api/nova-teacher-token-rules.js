import { createClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const FIRST_MONTH = '2026-11'

const client = (url, key) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const fail = (message, status = 400) => Object.assign(new Error(message), { status })

async function requireNovaOperator(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw fail('Configurazione server Nova mancante.', 503)

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw fail('Sessione Nova richiesta.', 401)
  const admin = client(url, key)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) throw fail('Sessione Nova scaduta.', 401)
  let profile = await admin.from('users').select('role,is_active').eq('id', data.user.id).maybeSingle()
  if (profile.error) throw fail('Impossibile verificare autorizzazioni.', 503)
  if (!profile.data && data.user.email) {
    profile = await admin.from('users').select('role,is_active').ilike('email', data.user.email).maybeSingle()
    if (profile.error) throw fail('Impossibile verificare autorizzazioni.', 503)
  }
  const role = String(profile.data?.role || '').toLowerCase()
  if (!['admin', 'user'].includes(role) || profile.data?.is_active === false) {
    throw fail('Accesso non autorizzato.', 403)
  }
  return { admin, user: data.user, role }
}

function orchideaAdmin() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const key = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY
    || (url === novaUrl ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  if (!url || !key) throw fail('Configurazione database Orchidea non disponibile.', 503)
  return client(url, key)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Metodo non consentito.' })
  try {
    const { admin, user, role } = await requireNovaOperator(req)

    if (req.method === 'GET') {
      const { data, error } = await admin
        .from('teacher_token_compensation_rules')
        .select('course_id,include_tokens,effective_from,updated_at')
        .order('course_id')
      if (error) throw error
      return res.status(200).json({ ok: true, rules: data || [], firstMonth: FIRST_MONTH })
    }

    if (role !== 'admin') throw fail('Solo gli amministratori possono modificare la regola dei gettoni.', 403)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const courseId = String(body.courseId || '')
    const effectiveFrom = String(body.effectiveFrom || FIRST_MONTH)
    if (!UUID.test(courseId)) throw fail('Seleziona un corso valido.')
    if (typeof body.includeTokens !== 'boolean') throw fail('Valore della regola non valido.')
    if (!MONTH.test(effectiveFrom) || effectiveFrom < FIRST_MONTH) {
      throw fail('La regola è applicabile da novembre 2026 in poi.')
    }

    const db = orchideaAdmin()
    const { data: course, error: courseError } = await db
      .from('corsi').select('id,nome').eq('id', courseId).maybeSingle()
    if (courseError) throw courseError
    if (!course) throw fail('Corso non trovato nel database Orchidea.', 404)

    const { data: saved, error } = await admin.from('teacher_token_compensation_rules')
      .upsert({
        course_id: courseId,
        include_tokens: body.includeTokens,
        effective_from: effectiveFrom,
        updated_at: new Date().toISOString(),
        changed_by: user.id,
      }, { onConflict: 'course_id' })
      .select('course_id,include_tokens,effective_from,updated_at').single()
    if (error) throw error
    return res.status(200).json({ ok: true, rule: saved, courseName: course.nome })
  } catch (error) {
    console.error('nova-teacher-token-rules:', error)
    const status = error?.status || 500
    return res.status(status).json({
      error: status < 500 ? error.message : 'Impossibile caricare o salvare le regole gettoni.',
    })
  }
}
