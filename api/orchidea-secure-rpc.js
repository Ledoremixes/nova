import { createClient } from '@supabase/supabase-js'

// RPC legacy consentite dal gestionale. Ogni richiesta richiede un JWT Nova
// valido e un profilo operatore attivo, verificati sul server.
// Non accettiamo nomi di funzioni, tabelle o campi arbitrari dal browser.
const FUNCTION_ARGS = Object.freeze({
  nova_aggiorna_quota_iscrizione: ['p_iscrizione_id', 'p_quota_allievo', 'p_quota_insegnante', 'p_percentuale_insegnante', 'p_pacchetto_nome', 'p_pacchetto_totale', 'p_note'],
  nova_assegna_corso_insegnante: ['p_corso_id', 'p_insegnante'],
  nova_corsi_list: [],
  nova_corso_partecipanti: ['p_corso_id'],
  nova_create_corso: ['p_payload'],
  nova_delete_corso: ['p_id'],
  nova_iscrivi_allievo_corso: ['p_corso_id', 'p_tesseramento_id', 'p_tariffa_mensile'],
  nova_pagamenti_allievi_mese: ['p_month'],
  nova_rimuovi_corso_insegnante: ['p_corso_id'],
  nova_rimuovi_iscrizione_corso: ['p_iscrizione_id'],
  nova_set_pagamento_allievo_mese: ['p_tesseramento_id', 'p_month', 'p_importo', 'p_stato', 'p_note', 'p_metodo'],
  nova_tesseramenti_list: [],
  nova_tesseramento_details: ['p_tesseramento_id'],
  nova_update_corso: ['p_id', 'p_payload'],
  nova_update_tesseramento: ['p_id', 'p_payload'],
})

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

async function requireNovaOperator(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw fail('Configurazione server Nova incompleta.', 503)

  const auth = String(req.headers?.authorization || '')
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim()
  if (!token) throw fail('Accedi a Nova per eseguire questa operazione.', 401)

  const nova = makeClient(url, key)
  const { data, error } = await nova.auth.getUser(token)
  if (error || !data?.user) throw fail('Sessione Nova non valida.', 401)

  let { data: profile, error: profileError } = await nova.from('users')
    .select('role,is_active,email')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError) throw profileError

  if (!profile && data.user.email) {
    const fallback = await nova.from('users')
      .select('role,is_active,email')
      .ilike('email', data.user.email)
      .maybeSingle()
    if (fallback.error) throw fallback.error
    profile = fallback.data
  }

  const role = String(profile?.role || '').toLowerCase().trim()
  if (!profile || !['admin', 'user'].includes(role) || profile.is_active === false) {
    throw fail('Operazione non autorizzata.', 403)
  }
  return { userId: data.user.id, role }
}

function orchideaAdmin() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const serviceKey = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY
    || (url === novaUrl ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  if (!url || !serviceKey) throw fail('Configurazione server Orchidea incompleta.', 503)
  return makeClient(url, serviceKey)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Authorization')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo non consentito.' })

  try {
    const operator = await requireNovaOperator(req)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Richiesta non valida.')

    const functionName = String(body.functionName || '')
    if (!Object.prototype.hasOwnProperty.call(FUNCTION_ARGS, functionName)) {
      throw fail('Funzione non autorizzata.', 403)
    }

    const args = body.args === undefined ? {} : body.args
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('Parametri non validi.')
    const accepted = FUNCTION_ARGS[functionName]
    const keys = Object.keys(args)
    if (keys.some((key) => !accepted.includes(key))) throw fail('Parametri non ammessi.')
    if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 16384) {
      throw fail('Parametri troppo grandi.', 413)
    }

    // Le chiavi riservate rimangono sul server. Conserviamo la semantica SQL
    // delle RPC esistenti durante il passaggio alle policy RLS restrittive.
    const { data, error } = await orchideaAdmin().rpc(functionName, args)
    if (error) {
      console.error('orchidea-secure-rpc:', { functionName, code: error.code, role: operator.role })
      return res.status(400).json({
        ok: false,
        code: String(error.code || ''),
        error: error.message || 'Operazione database non riuscita.',
      })
    }
    return res.status(200).json({ ok: true, data })
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    if (status >= 500) console.error('orchidea-secure-rpc: server error', error?.message)
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Servizio temporaneamente non disponibile.' : error.message,
    })
  }
}
