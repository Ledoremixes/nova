import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { isValidHistoricalCf, splitHistoricalRecords } from '../src/lib/historicalFiscalCode.js'

const SIGNATURE_BUCKET = 'nova-tesseramenti-firme'
const MAX_BATCH_SIZE = 4

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

function normalizeName(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function isAlreadyExistsError(error) {
  const text = `${error?.statusCode || ''} ${error?.message || ''} ${error?.error || ''}`.toLowerCase()
  return text.includes('already exists') || text.includes('duplicate')
}

function signatureBuffer(dataUrl) {
  if (!dataUrl) return null
  const match = String(dataUrl).match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new Error('Firma PNG non valida.')
  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length < 100 || buffer.length > 1_500_000) throw new Error('Dimensione firma non valida.')
  return buffer
}

function safeMessageId(value) {
  const id = clean(value).replace(/[^a-zA-Z0-9_-]/g, '')
  if (!id) throw new Error('Identificativo email sorgente mancante.')
  return id
}

async function requireNovaAdmin(req) {
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

  const role = clean(profile?.role).toLowerCase()
  if (!profile || role !== 'admin' || profile.is_active === false) {
    throw Object.assign(new Error('Solo un amministratore può importare i tesseramenti storici.'), { status: 403 })
  }

  return { user: data.user, profile }
}

function orchideaAdminClient() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const orchideaUrl = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const dedicatedKey = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || ''
  const sharedNovaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const orchideaKey = dedicatedKey || (orchideaUrl && orchideaUrl === novaUrl ? sharedNovaKey : '')

  if (!orchideaUrl || !orchideaKey) {
    throw Object.assign(
      new Error('Configura ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel per importare i tesseramenti storici.'),
      { status: 503 },
    )
  }

  return client(orchideaUrl, orchideaKey)
}

async function ensureSignatureBucket(admin) {
  const { data, error } = await admin.storage.listBuckets()
  if (error) throw error
  if ((data || []).some((bucket) => bucket.name === SIGNATURE_BUCKET)) return

  const created = await admin.storage.createBucket(SIGNATURE_BUCKET, {
    public: false,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'application/json'],
  })
  if (created.error && !isAlreadyExistsError(created.error)) throw created.error
}

async function findExisting(admin, record) {
  const cf = normalizeCf(record.cf)
  if (cf) {
    const byCf = await admin.from('tesseramenti').select('*').ilike('cf', cf).limit(1).maybeSingle()
    if (byCf.error) throw byCf.error
    if (byCf.data) return byCf.data
  }

  const email = clean(record.email).toLowerCase()
  const nascita = clean(record.nascita)
  if (!email || !nascita) return null

  const byIdentity = await admin
    .from('tesseramenti')
    .select('*')
    .ilike('email', email)
    .eq('nascita', nascita)
    .limit(20)

  if (byIdentity.error) throw byIdentity.error
  const wantedName = `${normalizeName(record.nome)}|${normalizeName(record.cognome)}`
  return (byIdentity.data || []).find((row) => (
    `${normalizeName(row.nome)}|${normalizeName(row.cognome)}` === wantedName
  )) || null
}

async function insertHistoricalStudent(admin, record, defaults) {
  if (!isValidHistoricalCf(record.cf)) throw new Error('Codice fiscale non valido: anagrafica esclusa dall’importazione.')
  const acceptedAt = new Date(record.accepted_at || Date.now())
  if (Number.isNaN(acceptedAt.getTime())) throw new Error('Data di accettazione non valida.')

  const payload = {
    nome: clean(record.nome),
    cognome: clean(record.cognome),
    email: clean(record.email).toLowerCase(),
    telefono: clean(record.telefono) || null,
    cf: normalizeCf(record.cf),
    nascita: clean(record.nascita) || null,
    luogo: clean(record.luogo) || null,
    residenza: clean(record.residenza) || null,
    status: clean(defaults.status) || 'active',
    payment_status: clean(defaults.payment_status) || 'unpaid',
    valid_from: acceptedAt.toISOString().slice(0, 10),
    qr_token: randomUUID(),
    numero_tessera: null,
    tessera_attiva: defaults.tessera_attiva !== false,
    is_corsista: defaults.is_corsista === true,
    stagione: clean(defaults.season) || '2026/2027',
    auth_user_id: null,
    created_at: acceptedAt.toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (!payload.nome || !payload.cognome || !payload.email || !payload.cf) {
    throw new Error('Nome, cognome, email o codice fiscale mancanti.')
  }

  const inserted = await admin.from('tesseramenti').insert([payload]).select('*').single()
  if (inserted.error) throw inserted.error
  return inserted.data
}

async function uploadHistoricalSignature(admin, { student, record, operator, defaults }) {
  const buffer = signatureBuffer(record.signature_data_url)
  if (!buffer) return { state: 'missing' }

  const messageId = safeMessageId(record.source_message_id)
  const basePath = `${student.id}/historical-gmail/${messageId}`
  const signaturePath = `${basePath}-firma.png`
  const manifestPath = `${basePath}-manifest.json`

  const signatureUpload = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(signaturePath, buffer, { contentType: 'image/png', upsert: false, cacheControl: '0' })

  const signatureAlreadyPresent = Boolean(signatureUpload.error && isAlreadyExistsError(signatureUpload.error))
  if (signatureUpload.error && !signatureAlreadyPresent) throw signatureUpload.error

  const manifest = {
    version: 1,
    type: 'tesseramento_storico_gmail',
    source: 'tesseramento.orchidea@gmail.com',
    source_message_id: messageId,
    source_subject: clean(record.source_subject) || null,
    signed_at: record.accepted_at || null,
    imported_at: new Date().toISOString(),
    signature_path: signaturePath,
    operator: {
      id: operator.user?.id || null,
      email: operator.user?.email || operator.profile?.email || null,
    },
    consents: {
      terms: record.consents?.terms === true,
      privacy: record.consents?.privacy === true,
      photo: record.consents?.photo === true,
      signature_declared: record.consents?.signature_declared === true,
    },
    import_rules: {
      overwrite_existing: false,
      create_auth_user: false,
      season: clean(defaults.season) || '2026/2027',
    },
    student_snapshot: {
      id: student.id,
      nome: student.nome || null,
      cognome: student.cognome || null,
      cf: student.cf || null,
      nascita: student.nascita || null,
      luogo: student.luogo || null,
      email: student.email || null,
      telefono: student.telefono || null,
      residenza: student.residenza || null,
      stagione: student.stagione || null,
      auth_user_id: student.auth_user_id || null,
    },
  }

  const manifestUpload = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), {
      contentType: 'application/json',
      upsert: false,
      cacheControl: '0',
    })

  if (manifestUpload.error && !isAlreadyExistsError(manifestUpload.error)) throw manifestUpload.error
  return { state: signatureAlreadyPresent ? 'already_present' : 'uploaded' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })

  try {
    const operator = await requireNovaAdmin(req)
    const admin = orchideaAdminClient()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const records = Array.isArray(body.records) ? body.records : []
    const defaults = body.defaults || {}

    if (body.format !== 'nova_historical_membership_import' || Number(body.version) !== 1) {
      return json(res, 400, { error: 'File di importazione non riconosciuto.' })
    }
    if (!records.length || records.length > MAX_BATCH_SIZE) {
      return json(res, 400, { error: `Invia da 1 a ${MAX_BATCH_SIZE} tesseramenti per volta.` })
    }

    // Validate the actual code, never the flag supplied by the JSON file.
    // Excluded people do not reach the registry lookup, insert or signature upload.
    const { eligible, excluded } = splitHistoricalRecords(records)
    if (eligible.some((record) => Boolean(record.signature_data_url))) {
      await ensureSignatureBucket(admin)
    }

    const summary = {
      processed: excluded.length,
      inserted: 0,
      skipped_existing: 0,
      skipped_invalid_cf: excluded.length,
      excluded: excluded.map((record) => ({
        source_message_id: clean(record?.source_message_id) || null,
        name: `${clean(record?.nome)} ${clean(record?.cognome)}`.trim() || 'Senza nome',
        cf: clean(record?.cf),
        reason: 'Codice fiscale non valido: anagrafica non importata.',
      })),
      signatures_uploaded: 0,
      signatures_already_present: 0,
      signatures_missing: 0,
      errors: [],
    }

    for (const record of eligible) {
      try {
        let student = await findExisting(admin, record)
        const existing = Boolean(student)

        if (!student) {
          student = await insertHistoricalStudent(admin, record, defaults)
          summary.inserted += 1
        } else {
          summary.skipped_existing += 1
        }

        const signature = await uploadHistoricalSignature(admin, { student, record, operator, defaults })
        if (signature.state === 'uploaded') summary.signatures_uploaded += 1
        if (signature.state === 'already_present') summary.signatures_already_present += 1
        if (signature.state === 'missing') summary.signatures_missing += 1
        summary.processed += 1

        if (existing) {
          // Regola fondamentale della migrazione: nessun campo dell'anagrafica
          // già presente viene aggiornato. La firma storica resta un allegato separato.
        }
      } catch (error) {
        summary.errors.push({
          source_message_id: clean(record.source_message_id) || null,
          name: `${clean(record.nome)} ${clean(record.cognome)}`.trim() || 'Senza nome',
          error: error.message || 'Errore importazione',
        })
      }
    }

    return json(res, 200, { ok: summary.errors.length === 0, summary })
  } catch (error) {
    console.error('orchidea-historical-memberships:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore importazione tesseramenti storici' })
  }
}
