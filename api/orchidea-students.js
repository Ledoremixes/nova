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

const TESSERAMENTI_LIST_SELECT = `
  id,
  nome,
  cognome,
  nascita,
  luogo,
  cf,
  email,
  telefono,
  residenza,
  status,
  payment_status,
  valid_from,
  valid_until,
  qr_token,
  numero_tessera,
  tessera_attiva,
  is_corsista,
  stagione,
  auth_user_id,
  created_at,
  updated_at
`

// Funzioni RPC Nova ammesse via backend (mai nomi arbitrari dal client).
const NOVA_RPC_ARGS = Object.freeze({
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
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Metodo non consentito' })

  let createdAuthUserId = null
  let authUserWasCreated = false

  try {
    const operator = await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()

    // Riutilizziamo un endpoint esistente perché Vercel Hobby limita il
    // progetto Nova a 12 funzioni serverless per deployment.
    if (req.method === 'POST' && String(req.query?.rpc || '') === '1') {
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Vary', 'Authorization')
      const rpcBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
      if (!rpcBody || typeof rpcBody !== 'object' || Array.isArray(rpcBody)) {
        return json(res, 400, { ok: false, error: 'Richiesta non valida.' })
      }

      const functionName = String(rpcBody.functionName || '')
      if (!Object.prototype.hasOwnProperty.call(NOVA_RPC_ARGS, functionName)) {
        return json(res, 403, { ok: false, error: 'Funzione non autorizzata.' })
      }

      const args = rpcBody.args === undefined ? {} : rpcBody.args
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return json(res, 400, { ok: false, error: 'Parametri non validi.' })
      }
      if (Object.keys(args).some((key) => !NOVA_RPC_ARGS[functionName].includes(key))) {
        return json(res, 400, { ok: false, error: 'Parametri non ammessi.' })
      }
      if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 16384) {
        return json(res, 413, { ok: false, error: 'Parametri troppo grandi.' })
      }

      const { data, error } = await orchidea.rpc(functionName, args)
      if (error) {
        console.error('nova rpc gateway:', { functionName, code: error.code, role: operator.role })
        return json(res, 400, {
          ok: false,
          code: String(error.code || ''),
          error: error.message || 'Operazione database non riuscita.',
        })
      }
      return json(res, 200, { ok: true, data })
    }

    // Lettura server-side dell'archivio tesserati. Serve come percorso stabile
    // per Nova quando il browser sta ancora sincronizzando la seconda sessione
    // Supabase Orchidea o quando il client dedicato non è autenticato.
    // L'accesso resta protetto: accettiamo solo un token Nova valido di admin/user.
    if (req.method === 'GET' && String(req.query?.details || '') === '1') {
      // La sessione Nova è già stata verificata da requireNovaOperator.
      // Non usare RPC SECURITY DEFINER accessibili dal browser per i dettagli.
      const studentId = String(req.query?.studentId || '').trim()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
        return json(res, 400, { error: 'Identificativo tesserato non valido.' })
      }

      const [enrollmentsResult, paymentsResult] = await Promise.all([
        orchidea
          .from('iscrizioni_corsi')
          .select(`
            id,stato,note,tesseramento_id,corso_id,data_iscrizione,
            tariffa_mensile,quota_allievo_mensile,quota_insegnante_mensile,
            percentuale_insegnante,note_pacchetto,tipo_pagamento,
            data_inizio,data_fine,rinnovo_attivo,genera_pagamento,
            pacchetto_id,pacchetto_nome,pacchetto_totale_mensile,
            quota_pacchetto_percentuale,created_at,
            corsi(id,nome,disciplina,livello,giorno_settimana,ora_inizio,ora_fine,prezzo_mensile)
          `)
          .eq('tesseramento_id', studentId)
          .order('created_at', { ascending: false })
          .limit(1000),
        orchidea
          .from('pagamenti')
          .select('id,tesseramento_id,descrizione,importo,periodo,scadenza,stato,metodo,pagato_il,created_at')
          .eq('tesseramento_id', studentId)
          .order('created_at', { ascending: false })
          .limit(12),
      ])
      if (enrollmentsResult.error) throw enrollmentsResult.error
      if (paymentsResult.error) throw paymentsResult.error
      return json(res, 200, {
        ok: true,
        enrollments: enrollmentsResult.data || [],
        payments: paymentsResult.data || [],
      })
    }

    if (req.method === 'GET') {
      const pageSize = 1000
      const students = []

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await orchidea
          .from('tesseramenti')
          .select(TESSERAMENTI_LIST_SELECT)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)

        if (error) throw error
        const chunk = data || []
        students.push(...chunk)
        if (chunk.length < pageSize) break
      }

      return json(res, 200, { ok: true, students, total: students.length })
    }

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
