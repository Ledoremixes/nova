import { createClient } from '@supabase/supabase-js'

const client = (url, key) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function errorWithStatus(message, status) {
  return Object.assign(new Error(message), { status })
}

async function requireNovaAdmin(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw errorWithStatus('Configurazione server Nova incompleta.', 503)

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw errorWithStatus('Sessione Nova mancante.', 401)
  const nova = client(url, key)
  const { data: auth, error: authError } = await nova.auth.getUser(token)
  if (authError || !auth?.user) throw errorWithStatus('Sessione Nova non valida.', 401)

  let { data: profile, error: profileError } = await nova
    .from('users')
    .select('role,is_active,email')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (profileError) throw profileError

  if (!profile && auth.user.email) {
    const fallback = await nova
      .from('users')
      .select('role,is_active,email')
      .ilike('email', auth.user.email)
      .maybeSingle()
    if (fallback.error) throw fallback.error
    profile = fallback.data
  }

  if (!profile || String(profile.role || '').toLowerCase() !== 'admin' || profile.is_active === false) {
    throw errorWithStatus('Accesso riservato agli amministratori Nova.', 403)
  }
}

function orchideaClient() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const key = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY
    || (url === novaUrl ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  if (!url || !key) throw errorWithStatus('Configurazione database Orchidea incompleta.', 503)
  return client(url, key)
}

async function fetchEveryRow(db, table, select, orderColumn) {
  const all = []
  const pageSize = 1000
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
      .range(start, start + pageSize - 1)
    if (error) throw error
    const chunk = data || []
    all.push(...chunk)
    if (chunk.length < pageSize) return all
  }
}

function activeEnrollment(row, startOfMonth, endOfMonth) {
  const status = String(row.stato || '').trim().toLowerCase()
  if (['annullato', 'rimosso', 'cancellato', 'inactive', 'non_attivo'].includes(status)) return false
  if (row.rinnovo_attivo === false) return false
  const from = String(row.data_inizio || row.data_iscrizione || row.created_at || '').slice(0, 10)
  const to = String(row.data_fine || '').slice(0, 10)
  return (!from || from <= endOfMonth) && (!to || to >= startOfMonth)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito.' })
  try {
    await requireNovaAdmin(req)
    const month = String(req.query?.month || '')
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
      throw errorWithStatus('Mese non valido.', 400)
    }
    const [year, monthNumber] = month.split('-').map(Number)
    const monthStart = month + '-01'
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
    const db = orchideaClient()

    const [enrollments, courses] = await Promise.all([
      fetchEveryRow(db, 'iscrizioni_corsi',
        'id,tesseramento_id,corso_id,stato,rinnovo_attivo,data_iscrizione,data_inizio,data_fine,created_at', 'id'),
      fetchEveryRow(db, 'corsi', 'id,nome', 'id'),
    ])
    const courseNames = new Map(courses.map((course) => [String(course.id), String(course.nome || 'Corso')]))
    const byStudent = new Map()

    for (const enrollment of enrollments) {
      if (!activeEnrollment(enrollment, monthStart, monthEnd)) continue
      const id = String(enrollment.tesseramento_id || '')
      if (!id) continue
      if (!byStudent.has(id)) byStudent.set(id, new Set())
      const courseName = courseNames.get(String(enrollment.corso_id || ''))
      if (courseName) byStudent.get(id).add(courseName)
    }

    const students = [...byStudent].map(([id, courseSet]) => ({
      id,
      courses: [...courseSet].sort((a, b) => a.localeCompare(b, 'it')),
    }))

    return res.status(200).json({ ok: true, month, students })
  } catch (error) {
    console.error('orchidea-medical-enrollments:', error)
    return res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? error.message : 'Impossibile caricare i corsisti attivi per le visite mediche.',
    })
  }
}
