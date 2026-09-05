import { createClient } from '@supabase/supabase-js'

function env(name, fallback = '') {
  return process.env[name] || fallback || ''
}

function json(res, status, payload) {
  res.status(status).json(payload)
}

function serverClient() {
  const url = env('SUPABASE_URL', env('VITE_SUPABASE_URL'))
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY su Vercel per gestire gli utenti.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function orchideaClientOptional() {
  const url = env('ORCHIDEA_SUPABASE_URL', env('VITE_ORCHIDEA_SUPABASE_URL'))
  const key = env('ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  const novaUrl = env('SUPABASE_URL', env('VITE_SUPABASE_URL'))
  if (url === novaUrl && key === env('SUPABASE_SERVICE_ROLE_KEY')) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function findAuthUserByEmail(admin, email) {
  const wanted = String(email || '').trim().toLowerCase()
  if (!admin || !wanted) return null
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = (data?.users || []).find((user) => String(user.email || '').toLowerCase() === wanted)
    if (found) return found
    if ((data?.users || []).length < 200) break
  }
  return null
}

async function requireAdmin(req, admin) {
  const authorization = String(req.headers.authorization || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) throw Object.assign(new Error('Sessione mancante.'), { status: 401 })
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) throw Object.assign(new Error('Sessione non valida.'), { status: 401 })
  const authUser = userData.user
  let { data: profile } = await admin.from('users').select('id,email,role,is_active').eq('id', authUser.id).maybeSingle()
  if (!profile && authUser.email) {
    const byEmail = await admin.from('users').select('id,email,role,is_active').ilike('email', authUser.email).maybeSingle()
    profile = byEmail.data
  }
  if (!profile || String(profile.role || '').toLowerCase() !== 'admin' || profile.is_active === false) {
    throw Object.assign(new Error('Operazione riservata agli admin.'), { status: 403 })
  }
  return authUser
}

async function listAllAuthUsers(admin) {
  const users = []
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    users.push(...(data?.users || []))
    if ((data?.users || []).length < 200) break
  }
  return users
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Metodo non consentito' })
  try {
    const admin = serverClient()
    const orchidea = orchideaClientOptional()
    const current = await requireAdmin(req, admin)

    if (req.method === 'GET') {
      const [authUsers, profilesRes] = await Promise.all([
        listAllAuthUsers(admin),
        admin.from('users').select('id,email,role,is_active,created_at'),
      ])
      if (profilesRes.error) throw profilesRes.error
      const byId = new Map((profilesRes.data || []).map((item) => [String(item.id), item]))
      const byEmail = new Map((profilesRes.data || []).map((item) => [String(item.email || '').toLowerCase(), item]))
      const rows = authUsers.map((user) => {
        const profile = byId.get(String(user.id)) || byEmail.get(String(user.email || '').toLowerCase()) || {}
        return {
          id: user.id,
          email: user.email || profile.email || '',
          role: profile.role || 'user',
          is_active: profile.is_active !== false,
          created_at: user.created_at || profile.created_at || null,
          last_sign_in_at: user.last_sign_in_at || null,
          auth_confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
          is_current: user.id === current.id,
        }
      })
      return json(res, 200, rows.sort((a, b) => a.email.localeCompare(b.email)))
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const role = body.role === 'admin' ? 'admin' : 'user'
      const isActive = body.is_active !== false
      if (!email) return json(res, 400, { error: 'Inserisci una email.' })
      if (password.length < 6) return json(res, 400, { error: 'La password deve avere almeno 6 caratteri.' })
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) throw error
      const uid = data.user.id
      const { error: profileError } = await admin.from('users').upsert({ id: uid, email, role, is_active: isActive }, { onConflict: 'id' })
      if (profileError) {
        await admin.auth.admin.deleteUser(uid).catch(() => null)
        throw profileError
      }
      let orchideaSynced = false
      if (orchidea) {
        try {
          const existingOrchidea = await findAuthUserByEmail(orchidea, email)
          if (existingOrchidea) {
            const { error: syncError } = await orchidea.auth.admin.updateUserById(existingOrchidea.id, { password, email_confirm: true })
            if (syncError) throw syncError
          } else {
            const { error: syncError } = await orchidea.auth.admin.createUser({ email, password, email_confirm: true })
            if (syncError) throw syncError
          }
          orchideaSynced = true
        } catch (syncError) {
          await admin.from('users').delete().eq('id', uid)
          await admin.auth.admin.deleteUser(uid).catch(() => null)
          throw new Error(`Utente non creato: sincronizzazione Orchidea Allievi fallita. ${syncError.message || syncError}`)
        }
      }
      return json(res, 201, { id: uid, email, role, is_active: isActive, orchidea_synced: orchideaSynced })
    }

    const id = String(body.id || req.query?.id || '')
    if (!id) return json(res, 400, { error: 'Utente non indicato.' })

    if (req.method === 'PATCH') {
      const { data: beforeAuth } = await admin.auth.admin.getUserById(id)
      const previousEmail = beforeAuth?.user?.email || String(body.current_email || '').trim().toLowerCase()
      const updates = {}
      if (body.email !== undefined) updates.email = String(body.email || '').trim().toLowerCase()
      if (body.password) {
        if (String(body.password).length < 6) return json(res, 400, { error: 'La password deve avere almeno 6 caratteri.' })
        updates.password = String(body.password)
      }
      if (Object.keys(updates).length) {
        const { error } = await admin.auth.admin.updateUserById(id, updates)
        if (error) throw error
      }
      const profilePayload = {
        id,
        email: updates.email || String(body.current_email || body.email || '').trim().toLowerCase(),
        role: body.role === 'admin' ? 'admin' : 'user',
        is_active: body.is_active !== false,
      }
      if (!profilePayload.email) {
        const { data } = await admin.auth.admin.getUserById(id)
        profilePayload.email = data?.user?.email || ''
      }
      const existingProfileById = await admin.from('users').select('id,email').eq('id', id).maybeSingle()
      let profileError = null
      if (existingProfileById.data) {
        profileError = (await admin.from('users').update({ email: profilePayload.email, role: profilePayload.role, is_active: profilePayload.is_active }).eq('id', existingProfileById.data.id)).error
      } else if (body.current_email) {
        profileError = (await admin.from('users').update({ email: profilePayload.email, role: profilePayload.role, is_active: profilePayload.is_active }).ilike('email', body.current_email)).error
      } else {
        profileError = (await admin.from('users').upsert(profilePayload, { onConflict: 'id' })).error
      }
      if (profileError) throw profileError

      let orchideaSynced = false
      if (orchidea) {
        const orchideaUser = await findAuthUserByEmail(orchidea, previousEmail || profilePayload.email)
        if (orchideaUser) {
          const orchideaUpdates = {}
          if (updates.email) orchideaUpdates.email = updates.email
          if (body.password) orchideaUpdates.password = String(body.password)
          if (Object.keys(orchideaUpdates).length) {
            const { error: syncError } = await orchidea.auth.admin.updateUserById(orchideaUser.id, orchideaUpdates)
            if (syncError) throw new Error(`Nova aggiornata, ma sincronizzazione Orchidea Allievi fallita: ${syncError.message}`)
          }
          orchideaSynced = true
        } else if (body.password) {
          const { error: syncError } = await orchidea.auth.admin.createUser({ email: profilePayload.email, password: String(body.password), email_confirm: true })
          if (syncError) throw new Error(`Nova aggiornata, ma creazione account Orchidea Allievi fallita: ${syncError.message}`)
          orchideaSynced = true
        }
      }
      return json(res, 200, { ...profilePayload, orchidea_synced: orchideaSynced })
    }

    if (req.method === 'DELETE') {
      if (id === current.id) return json(res, 400, { error: 'Non puoi eliminare l’account admin con cui sei attualmente connesso.' })
      const { data: authBefore } = await admin.auth.admin.getUserById(id)
      const emailBefore = authBefore?.user?.email || ''
      await admin.from('users').delete().eq('id', id)
      if (emailBefore) await admin.from('users').delete().ilike('email', emailBefore)
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
      if (orchidea && emailBefore) {
        const orchideaUser = await findAuthUserByEmail(orchidea, emailBefore)
        if (orchideaUser) {
          const { error: syncError } = await orchidea.auth.admin.deleteUser(orchideaUser.id)
          if (syncError) throw new Error(`Utente eliminato da Nova, ma non da Orchidea Allievi: ${syncError.message}`)
        }
      }
      return json(res, 200, { ok: true })
    }
  } catch (error) {
    console.error('admin-users:', error)
    return json(res, error.status || 500, { error: error.message || 'Errore gestione utenti' })
  }
}
