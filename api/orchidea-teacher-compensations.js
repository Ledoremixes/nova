import { createClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function createAdmin(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

async function requireNovaAdmin(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw fail('Configurazione server Nova mancante.', 503)

  const authorization = String(req.headers.authorization || '')
  if (!authorization.startsWith('Bearer ')) throw fail('Sessione Nova mancante.', 401)

  const nova = createAdmin(url, key)
  const { data, error } = await nova.auth.getUser(authorization.slice(7))
  if (error || !data?.user) throw fail('Sessione Nova non valida.', 401)

  let lookup = await nova.from('users').select('role,is_active').eq('id', data.user.id).maybeSingle()
  if (lookup.error) throw fail('Impossibile verificare i permessi Nova.', 503)
  if (!lookup.data && data.user.email) {
    lookup = await nova.from('users').select('role,is_active').ilike('email', data.user.email).maybeSingle()
    if (lookup.error) throw fail('Impossibile verificare i permessi Nova.', 503)
  }
  if (String(lookup.data?.role || '').toLowerCase() !== 'admin' || lookup.data?.is_active === false) {
    throw fail('Solo un amministratore Nova può sincronizzare i compensi.', 403)
  }
}

function orchideaAdmin() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const key = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY ||
    (url === novaUrl ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  if (!url || !key) throw fail('Configurazione server Orchidea mancante.', 503)
  return createAdmin(url, key)
}

function normalizeItem(item, month) {
  const teacherId = String(item.teacher_id || '')
  if (!UUID.test(teacherId)) throw fail('ID insegnante non valido.')
  const total = Number(item.total)
  if (!Number.isFinite(total) || total < 0 || total > 10000000) throw fail('Compenso non valido.')
  const breakdown = item.breakdown
  if (!Array.isArray(breakdown) || breakdown.length > 300) throw fail('Dettaglio corsi non valido.')

  let sum = 0
  const cleanRows = breakdown.map(row => {
    const amount = Number(row.compenso)
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      throw fail('Importo di un corso non valido.')
    }
    sum += amount
    return {
      corso_nome: String(row.corso_nome || '').slice(0, 160),
      corso_livello: String(row.corso_livello || '').slice(0, 100),
      compenso: Math.round(amount * 100) / 100,
      aliquota: row.aliquota === null || row.aliquota === undefined ? null : Number(row.aliquota),
      metodo_compenso: String(row.metodo_compenso || '').slice(0, 80),
      corsisti_paganti: Number.isInteger(row.corsisti_paganti) ? Math.max(0, row.corsisti_paganti) : null,
      incasso_attribuito: Math.round(Math.max(0, Number(row.incasso_attribuito) || 0) * 100) / 100,
    }
  })
  const rounded = Math.round(total * 100) / 100
  if (Math.abs(Math.round(sum * 100) / 100 - rounded) > 0.01) {
    throw fail('Totale e dettaglio Nova non corrispondono.')
  }
  return { teacher_id: teacherId, mese: month, totale: rounded, breakdown: cleanRows, synced_at: new Date().toISOString() }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' })
  res.setHeader('Cache-Control', 'no-store')

  try {
    await requireNovaAdmin(req)
    const month = String(req.body?.month || '')
    if (!MONTH.test(month)) throw fail('Mese non valido.')
    const items = req.body?.payouts
    if (!Array.isArray(items) || !items.length || items.length > 100) {
      throw fail('Elenco insegnanti non valido.')
    }
    const rows = items.map(item => normalizeItem(item, month))
    if (new Set(rows.map(row => row.teacher_id)).size !== rows.length) throw fail('Insegnante duplicato.')

    const orchidea = orchideaAdmin()
    const { data: teacherRows, error: teacherError } = await orchidea
      .from('insegnanti')
      .select('id')
      .in('id', rows.map(row => row.teacher_id))
    if (teacherError) throw teacherError
    if ((teacherRows || []).length !== rows.length) {
      throw fail('Almeno un insegnante Nova non è collegato al database Orchidea.', 409)
    }
    const { error } = await orchidea
      .from('nova_teacher_payout_snapshots')
      .upsert(rows, { onConflict: 'teacher_id,mese' })
    if (error) throw error

    return res.status(200).json({ ok: true, synced: rows.length, month })
  } catch (error) {
    console.error('nova-teacher-compensation-sync', error)
    const status = error?.status || 500
    return res.status(status).json({
      error: status < 500 ? error.message : 'Non riesco a sincronizzare i compensi. Verifica i permessi e riprova.',
    })
  }
}
