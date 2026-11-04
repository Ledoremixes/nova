import { createClient } from '@supabase/supabase-js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EDITABLE_FIELDS = [
  'nome', 'cognome', 'email', 'telefono', 'cf', 'nascita',
  'luogo', 'residenza', 'numero_tessera', 'stagione',
  'status', 'payment_status', 'tessera_attiva', 'is_corsista',
]
const BOOLEAN_FIELDS = new Set(['tessera_attiva', 'is_corsista'])

const clean = (value) => String(value ?? '').trim()
const emailKey = (value) => clean(value).toLowerCase()

function json(res, status, payload) {
  return res.status(status).json(payload)
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireNovaOperator(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw fail('Configurazione server Nova incompleta.', 503)

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw fail('Accedi a Nova per aggiornare la scheda.', 401)

  const nova = client(url, key)
  const { data, error } = await nova.auth.getUser(token)
  if (error || !data?.user) throw fail('Sessione Nova scaduta o non valida.', 401)

  const { data: byId, error: profileError } = await nova
    .from('users')
    .select('role,is_active,email')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError) throw profileError

  let profile = byId
  if (!profile && data.user.email) {
    const result = await nova.from('users')
      .select('role,is_active,email')
      .ilike('email', data.user.email)
      .maybeSingle()
    if (result.error) throw result.error
    profile = result.data
  }
  const role = emailKey(profile?.role)
  if (!profile || !['admin', 'user'].includes(role) || profile.is_active === false) {
    throw fail('Non sei autorizzato a modificare le schede tesserati.', 403)
  }
  return { role }
}

function orchideaAdminClient() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const url = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const orchideaKey = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || ''
  const novaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const key = orchideaKey || (url === novaUrl ? novaKey : '')
  if (!url || !key) {
    throw fail('Manca ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel: nessun dato è stato modificato.', 503)
  }
  return client(url, key)
}

function normalizeStudentPayload(input) {
  const result = {}
  for (const field of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue
    const value = input[field]
    if (BOOLEAN_FIELDS.has(field)) {
      result[field] = value === true || value === 'true' || value === 1
    } else if (field === 'nascita') {
      result[field] = clean(value) || null
    } else if (field === 'email') {
      result[field] = emailKey(value) || null
    } else if (field === 'cf') {
      result[field] = clean(value).toUpperCase() || null
    } else {
      result[field] = clean(value) || null
    }
  }
  return result
}

async function findAuthUserByEmail(admin, email) {
  if (!email) return null
  // Gli utenti importati non sempre hanno auth_user_id: riconciliamo
  // l'identita' tramite la VECCHIA email, mai tramite quella appena inserita.
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = data?.users || []
    const found = users.find((user) => emailKey(user.email) === emailKey(email))
    if (found) return found
    if (users.length < 200) return null
  }
  throw fail('Archivio Auth troppo grande per identificare l’account: modifica non effettuata.', 503)
}

function authEmailIdentityMatches(user, expectedEmail) {
  const identity = (user?.identities || []).find((item) => item.provider === 'email')
  // Gli account OAuth non hanno necessariamente una identity email.
  return !identity || emailKey(identity.identity_data?.email) === expectedEmail
}

async function restoreAuthEmail(admin, userId, originalEmail, wasConfirmed) {
  if (!originalEmail) return false
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: originalEmail,
    email_confirm: Boolean(wasConfirmed),
  })
  return !error
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito.' })

  try {
    const { role } = await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const studentId = clean(body.studentId)
    const submitted = body.payload

    if (!UUID_RE.test(studentId) || !submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
      throw fail('Scheda tesserato non valida.')
    }

    const { data: original, error: readError } = await orchidea
      .from('tesseramenti')
      .select('*')
      .eq('id', studentId)
      .maybeSingle()
    if (readError) throw readError
    if (!original) throw fail('Tesserato non trovato nell’archivio Orchidea.', 404)

    const previousEmail = emailKey(original.email)
    if (Object.prototype.hasOwnProperty.call(body, 'expectedEmail')
      && emailKey(body.expectedEmail) !== previousEmail) {
      throw fail('La mail del tesserato è stata modificata da un altro operatore. Ricarica la scheda prima di salvare.', 409)
    }

    const payload = normalizeStudentPayload(submitted)
    if (!Object.keys(payload).length) throw fail('Nessuna modifica da salvare.')
    const nextEmail = Object.prototype.hasOwnProperty.call(payload, 'email')
      ? emailKey(payload.email)
      : previousEmail
    const emailChanged = nextEmail !== previousEmail

    if (emailChanged && role !== 'admin') {
      throw fail('Soltanto un amministratore Nova può modificare la mail di accesso.', 403)
    }
    if (emailChanged && (!nextEmail || !EMAIL_RE.test(nextEmail) || nextEmail.length > 254)) {
      throw fail('Inserisci un indirizzo email valido e non vuoto.', 400)
    }

    let authUser = null
    let authWasUpdated = false
    let oldAuthEmail = ''
    let oldAuthConfirmed = false
    let emailLoginSynced = false

    if (emailChanged) {
      const duplicate = await orchidea.from('tesseramenti')
        .select('id')
        .ilike('email', nextEmail)
        .neq('id', studentId)
        .limit(1)
        .maybeSingle()
      if (duplicate.error) throw duplicate.error
      if (duplicate.data) {
        throw fail('Questa email è già associata a un altro tesserato. Nessuna modifica effettuata.', 409)
      }

      if (original.auth_user_id) {
        const result = await orchidea.auth.admin.getUserById(original.auth_user_id)
        if (result.error || !result.data?.user) {
          throw fail('La tessera è collegata a un account Auth che non risulta disponibile. Nessuna modifica effettuata: verifica il collegamento con l’amministratore.', 409)
        }
        authUser = result.data.user
      } else {
        authUser = await findAuthUserByEmail(orchidea, previousEmail)
      }

      if (authUser) {
        oldAuthEmail = emailKey(authUser.email)
        oldAuthConfirmed = Boolean(authUser.email_confirmed_at)
        if (oldAuthEmail !== nextEmail) {
          const update = await orchidea.auth.admin.updateUserById(authUser.id, {
            email: nextEmail,
            email_confirm: true,
          })
          if (update.error) {
            const isDuplicate = /already|exists|registered|duplicate|taken|unique/i.test(update.error.message || '')
            throw fail(
              isDuplicate
                ? 'Questa email è già utilizzata da un altro account di accesso. Nessuna modifica effettuata.'
                : 'Impossibile aggiornare l’email di accesso: ' + update.error.message,
              isDuplicate ? 409 : 502,
            )
          }
          authWasUpdated = true
        }
        emailLoginSynced = true
        payload.auth_user_id = authUser.id
      } else {
        // Nessun login è ancora associato: evitiamo di attribuire alla tessera
        // un indirizzo già posseduto da un altro utente Auth.
        const existingTargetAuth = await findAuthUserByEmail(orchidea, nextEmail)
        if (existingTargetAuth) {
          throw fail('La nuova email appartiene già a un account Auth non collegato a questa tessera. Nessuna modifica effettuata.', 409)
        }
      }
    }

    payload.updated_at = new Date().toISOString()

    // Confronto ottimistico: se cambia l'email da un'altra sessione, non
    // sovrascriviamo silenziosamente la scheda dopo aver toccato Auth.
    let write = orchidea.from('tesseramenti').update(payload).eq('id', studentId)
    write = previousEmail ? write.eq('email', original.email) : write.is('email', null)
    const { data: saved, error: writeError } = await write.select('*').maybeSingle()

    if (writeError || !saved) {
      if (authWasUpdated) {
        const restored = await restoreAuthEmail(orchidea, authUser.id, oldAuthEmail, oldAuthConfirmed)
        if (!restored) {
          throw fail('La scheda non è stata aggiornata e non è stato possibile ripristinare automaticamente la precedente email Auth. Contatta l’amministratore prima di riprovare.', 502)
        }
      }
      if (writeError) throw fail('Salvataggio annullato: ' + writeError.message, 502)
      throw fail('La scheda è cambiata durante il salvataggio. Nessuna modifica anagrafica applicata.', 409)
    }

    if (emailChanged && authUser) {
      const verification = await orchidea.auth.admin.getUserById(authUser.id)
      if (verification.error || emailKey(verification.data?.user?.email) !== nextEmail
        || !authEmailIdentityMatches(verification.data.user, nextEmail)) {
        console.error('Orchidea: impossibile verificare l’email Auth dopo il salvataggio.', {
          studentId, authUserId: authUser.id,
        })
        throw fail('La scheda è stata salvata, ma la sincronizzazione dell’account non è verificabile. Non ripetere la modifica: contatta l’amministratore.', 502)
      }
    }

    return json(res, 200, {
      ok: true,
      student: saved,
      emailChanged,
      emailLoginSynced,
      loginAccountFound: Boolean(authUser),
    })
  } catch (error) {
    console.error('orchidea-student-update:', error)
    return json(res, error.status || 500, {
      error: error.status && error.status < 500
        ? error.message
        : error.message || 'Errore nell’aggiornamento del tesserato.',
    })
  }
}
