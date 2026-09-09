import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SIGNATURE_BUCKET = 'nova-tesseramenti-firme'

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

  return { user: data.user, role, profile }
}

function orchideaAdminClient() {
  const novaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const orchideaUrl = process.env.ORCHIDEA_SUPABASE_URL || process.env.VITE_ORCHIDEA_SUPABASE_URL || novaUrl
  const dedicatedKey = process.env.ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY || ''
  const sharedNovaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const orchideaKey = dedicatedKey || (orchideaUrl && orchideaUrl === novaUrl ? sharedNovaKey : '')

  if (!orchideaUrl || !orchideaKey) {
    throw Object.assign(
      new Error('Configura ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY su Vercel per usare il tesseramento assistito.'),
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

async function findExistingTesseramento(admin, { studentId, cf, email }) {
  if (studentId) {
    const byId = await admin.from('tesseramenti').select('*').eq('id', studentId).limit(1).maybeSingle()
    if (byId.error) throw byId.error
    if (byId.data) return byId.data
  }

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
    return Math.max(highest, match ? Number(match[1]) || 0 : 0)
  }, 0)

  return `ORC-${String(max + 1).padStart(6, '0')}`
}

function signatureBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw Object.assign(new Error('Firma non valida. Fai firmare nuovamente il cliente.'), { status: 400 })
  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length < 800) throw Object.assign(new Error('La firma sembra vuota. Fai firmare nuovamente il cliente.'), { status: 400 })
  if (buffer.length > 1_500_000) throw Object.assign(new Error('Firma troppo grande. Cancella e firma nuovamente.'), { status: 400 })
  return buffer
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
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already')) throw created.error
}

function safeSeason(value) {
  return clean(value || '2026/2027').replace(/[^0-9A-Za-z_-]+/g, '-')
}

async function saveSignaturePackage(admin, { student, signatureDataUrl, consents, operator, extraction }) {
  await ensureSignatureBucket(admin)
  const signedAt = new Date().toISOString()
  const stamp = signedAt.replace(/[:.]/g, '-')
  const basePath = `${student.id}/${safeSeason(student.stagione)}/${stamp}`
  const signaturePath = `${basePath}-firma.png`
  const manifestPath = `${basePath}-manifest.json`
  const buffer = signatureBuffer(signatureDataUrl)

  const signatureUpload = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(signaturePath, buffer, { contentType: 'image/png', upsert: false, cacheControl: '0' })
  if (signatureUpload.error) throw signatureUpload.error

  const manifest = {
    version: 1,
    type: 'tesseramento_corsista_assistito',
    signed_at: signedAt,
    signature_path: signaturePath,
    operator: {
      id: operator.user?.id || null,
      email: operator.user?.email || operator.profile?.email || null,
      role: operator.role || null,
    },
    consents: {
      data_confirmed: consents?.data_confirmed === true,
      privacy: consents?.privacy === true,
      membership: consents?.membership === true,
    },
    extraction: {
      source: clean(extraction?.source) || 'manuale',
      barcode_cf_verified: extraction?.barcode_cf_verified === true,
      ocr_confidence: Number.isFinite(Number(extraction?.ocr_confidence)) ? Number(extraction.ocr_confidence) : null,
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
      numero_tessera: student.numero_tessera || null,
      stagione: student.stagione || null,
    },
    privacy_note: 'La foto usata per leggere il barcode della Tessera Sanitaria non viene salvata da Nova; viene conservata soltanto la firma e il riepilogo dei dati confermati.',
  }

  const manifestUpload = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), {
      contentType: 'application/json',
      upsert: false,
      cacheControl: '0',
    })
  if (manifestUpload.error) {
    await admin.storage.from(SIGNATURE_BUCKET).remove([signaturePath])
    throw manifestUpload.error
  }

  return { signedAt, signaturePath, manifestPath }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo non consentito' })

  let createdAuthUserId = null
  let authUserWasCreated = false

  try {
    const operator = await requireNovaOperator(req)
    const orchidea = orchideaAdminClient()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const person = body.person || {}

    const nome = clean(person.nome)
    const cognome = clean(person.cognome)
    const email = clean(person.email).toLowerCase()
    const telefono = clean(person.telefono)
    const cf = normalizeCf(person.cf)
    const nascita = clean(person.nascita) || null
    const luogo = clean(person.luogo) || null
    const residenza = clean(person.residenza) || null
    const stagione = clean(body.stagione) || '2026/2027'
    const consents = body.consents || {}

    if (!nome || !cognome) return json(res, 400, { error: 'Inserisci nome e cognome.' })
    if (!email || !email.includes('@')) return json(res, 400, { error: 'Inserisci un indirizzo email valido.' })
    if (!telefono) return json(res, 400, { error: 'Inserisci il numero di telefono.' })
    if (cf.length < 16) return json(res, 400, { error: 'Inserisci un codice fiscale completo.' })
    if (!nascita) return json(res, 400, { error: 'Inserisci la data di nascita.' })
    if (!luogo) return json(res, 400, { error: 'Inserisci il luogo di nascita.' })
    if (!residenza) return json(res, 400, { error: 'Inserisci la residenza.' })
    if (!consents.data_confirmed || !consents.privacy || !consents.membership) {
      return json(res, 400, { error: 'Il cliente deve confermare dati e consensi prima della firma.' })
    }
    signatureBuffer(body.signature_data_url)

    const existing = await findExistingTesseramento(orchidea, {
      studentId: clean(body.student_id),
      cf,
      email,
    })

    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    let student = existing
    let firstAccessPassword = null

    if (existing) {
      const updatePayload = {
        nome,
        cognome,
        email,
        telefono,
        cf,
        nascita,
        luogo,
        residenza,
        is_corsista: true,
        stagione,
        tessera_attiva: existing.tessera_attiva !== false,
        updated_at: now,
      }

      const updated = await orchidea
        .from('tesseramenti')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updated.error) throw updated.error
      student = updated.data
    } else {
      let authUser = await findAuthByEmail(orchidea, email)
      if (!authUser) {
        const authResult = await orchidea.auth.admin.createUser({
          email,
          password: cf,
          email_confirm: true,
          user_metadata: { nome, cognome, source: 'nova_tesseramento_assistito' },
        })
        if (authResult.error) throw authResult.error
        authUser = authResult.data.user
        createdAuthUserId = authUser?.id || null
        authUserWasCreated = Boolean(createdAuthUserId)
        firstAccessPassword = cf
      }

      const numeroTessera = await nextMembershipNumber(orchidea)
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

      const inserted = await orchidea.from('tesseramenti').insert([payload]).select('*').single()
      if (inserted.error) throw inserted.error
      student = inserted.data
    }

    const signature = await saveSignaturePackage(orchidea, {
      student,
      signatureDataUrl: body.signature_data_url,
      consents,
      operator,
      extraction: body.extraction || {},
    })

    return json(res, 200, {
      ok: true,
      existing: Boolean(existing),
      student,
      first_access_password: firstAccessPassword,
      signature,
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

    console.error('orchidea-assisted-membership:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore tesseramento assistito' })
  }
}
