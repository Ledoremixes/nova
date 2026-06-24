import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../api/supabase'
import { orchideaSupabase, hasDedicatedOrchideaConfig } from '../api/orchideaSupabase'

const AuthContext = createContext(null)

function normalizeProfile(row, fallbackUser) {
  if (!row) return null

  return {
    id: row.id || row.user_id || fallbackUser?.id,
    email: row.email || fallbackUser?.email,
    role: row.role || 'admin',
    is_active: row.is_active !== false,
    _source: row._source || 'nova',
  }
}

function isIgnorableProfileError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    text.includes('could not find') ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('column')
  )
}

async function findProfileRow(client, table, column, value) {
  if (!value) return null

  const { data, error } = await client
    .from(table)
    .select('*')
    .eq(column, value)
    .maybeSingle()

  if (data && !error) return data
  if (error && !isIgnorableProfileError(error)) {
    console.warn(`Profilo non letto da ${table}.${column}:`, error.message)
  }
  return null
}

async function readProfileFromClient(client, user, source = 'nova') {
  if (!client || !user) return null

  const attempts = [
    ['users', 'id', user.id],
    ['users', 'email', user.email],
    ['profiles', 'user_id', user.id],
    ['profiles', 'id', user.id],
    ['profiles', 'email', user.email],
  ]

  for (const [table, column, value] of attempts) {
    const row = await findProfileRow(client, table, column, value)
    if (row) return normalizeProfile({ ...row, _source: source }, user)
  }

  return null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [orchideaSession, setOrchideaSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orchideaAuthWarning, setOrchideaAuthWarning] = useState('')

  async function loadProfile(novaUser, orchideaUser = null) {
    const primaryUser = novaUser || orchideaUser

    if (!primaryUser) {
      setProfile(null)
      return null
    }

    const novaProfile = novaUser ? await readProfileFromClient(supabase, novaUser, 'nova') : null
    if (novaProfile) {
      setProfile(novaProfile)
      return novaProfile
    }

    const orchideaProfile = hasDedicatedOrchideaConfig && orchideaUser
      ? await readProfileFromClient(orchideaSupabase, orchideaUser, 'orchidea-allievi')
      : null

    if (orchideaProfile) {
      setProfile(orchideaProfile)
      return orchideaProfile
    }

    console.error('Profilo non trovato per:', primaryUser.email || primaryUser.id)
    setProfile(null)
    return null
  }

  useEffect(() => {
    let isMounted = true

    async function bootstrap() {
      try {
        setLoading(true)

        const {
          data: { session: novaSession },
        } = await supabase.auth.getSession()

        let allieviSession = null
        if (hasDedicatedOrchideaConfig) {
          const {
            data: { session: dedicatedSession },
          } = await orchideaSupabase.auth.getSession()
          allieviSession = dedicatedSession
        }

        if (!isMounted) return

        setSession(novaSession)
        setOrchideaSession(allieviSession)
        setUser(novaSession?.user ?? allieviSession?.user ?? null)

        if (hasDedicatedOrchideaConfig && novaSession?.user && !allieviSession?.user) {
          setOrchideaAuthWarning(
            'Sessione Orchidea Allievi non attiva: fai logout e accedi con le credenziali admin del portale allievi per vedere i tesserati ufficiali.'
          )
        } else {
          setOrchideaAuthWarning('')
        }

        if (novaSession?.user || allieviSession?.user) {
          await loadProfile(novaSession?.user ?? null, allieviSession?.user ?? null)
        } else {
          setProfile(null)
        }
      } catch (err) {
        console.error('Errore bootstrap auth:', err)
        if (isMounted) setProfile(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    bootstrap()

    const {
      data: { subscription: novaSubscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)

      const nextUser = nextSession?.user ?? orchideaSession?.user ?? null
      setUser(nextUser)

      if (!nextSession?.user && !orchideaSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        await loadProfile(nextSession?.user ?? null, orchideaSession?.user ?? null)
      } catch (err) {
        console.error('Errore onAuthStateChange Nova:', err)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })

    let orchideaSubscription = null
    if (hasDedicatedOrchideaConfig) {
      const { data } = orchideaSupabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setOrchideaSession(nextSession)
        setOrchideaAuthWarning('')

        const nextUser = session?.user ?? nextSession?.user ?? null
        setUser(nextUser)

        if (!session?.user && !nextSession?.user) {
          setProfile(null)
          setLoading(false)
          return
        }

        try {
          await loadProfile(session?.user ?? null, nextSession?.user ?? null)
        } catch (err) {
          console.error('Errore onAuthStateChange Orchidea:', err)
          setProfile(null)
        } finally {
          setLoading(false)
        }
      })
      orchideaSubscription = data.subscription
    }

    return () => {
      isMounted = false
      novaSubscription.unsubscribe()
      orchideaSubscription?.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setLoading(true)
    setOrchideaAuthWarning('')

    const novaResult = await supabase.auth.signInWithPassword({ email, password })
    let orchideaResult = { data: { session: null }, error: null }

    if (hasDedicatedOrchideaConfig) {
      orchideaResult = await orchideaSupabase.auth.signInWithPassword({ email, password })
    }

    if (novaResult.error && (!hasDedicatedOrchideaConfig || orchideaResult.error)) {
      setLoading(false)
      throw new Error(novaResult.error.message || orchideaResult.error?.message || 'Login non riuscito')
    }

    if (hasDedicatedOrchideaConfig && orchideaResult.error) {
      setOrchideaAuthWarning(
        `Login al database Orchidea Allievi non riuscito: ${orchideaResult.error.message}. I tesserati ufficiali non saranno visibili con questo account.`
      )
    }

    const novaSession = novaResult.data?.session ?? null
    const allieviSession = orchideaResult.data?.session ?? null

    setSession(novaSession)
    setOrchideaSession(allieviSession)
    setUser(novaSession?.user ?? allieviSession?.user ?? null)
    await loadProfile(novaSession?.user ?? null, allieviSession?.user ?? null)
    setLoading(false)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (hasDedicatedOrchideaConfig) {
      await orchideaSupabase.auth.signOut().catch((err) => {
        console.warn('Logout database Orchidea Allievi non riuscito:', err?.message || err)
      })
    }
    setSession(null)
    setOrchideaSession(null)
    setUser(null)
    setProfile(null)
    setOrchideaAuthWarning('')
    if (error) throw error
  }

  const value = useMemo(
    () => ({
      session,
      orchideaSession,
      user,
      profile,
      loading,
      signIn,
      signOut,
      isAuthenticated: Boolean(session?.user || orchideaSession?.user),
      role: profile?.role || null,
      isActive: profile?.is_active === true,
      orchideaAuthWarning,
      hasOrchideaSession: Boolean(orchideaSession?.user),
    }),
    [session, orchideaSession, user, profile, loading, orchideaAuthWarning]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
