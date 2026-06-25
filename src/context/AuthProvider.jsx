import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../api/supabase'
import { orchideaSupabase, hasDedicatedOrchideaConfig } from '../api/orchideaSupabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(currentUser) {
    if (!currentUser) {
      setProfile(null)
      return null
    }

    const { data: novaUser, error: novaError } = await supabase
      .from('users')
      .select('id, email, role, is_active')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (novaUser && !novaError) {
      setProfile(novaUser)
      return novaUser
    }

    // Compatibilità con gli utenti creati prima della migrazione Auth:
    // alcune righe in public.users possono avere un id diverso dall'UID Auth,
    // ma la stessa email. In quel caso leggiamo il profilo per email.
    if (!novaUser && currentUser.email && !novaError) {
      const { data: novaUserByEmail, error: novaEmailError } = await supabase
        .from('users')
        .select('id, email, role, is_active')
        .ilike('email', currentUser.email)
        .maybeSingle()

      if (novaUserByEmail && !novaEmailError) {
        const normalizedProfile = {
          id: currentUser.id,
          email: novaUserByEmail.email || currentUser.email,
          role: novaUserByEmail.role,
          is_active: novaUserByEmail.is_active,
        }
        setProfile(normalizedProfile)
        return normalizedProfile
      }
    }

    let orchideaProfile = null
    let orchideaError = null

    const profileByUser = await supabase
      .from('profiles')
      .select('user_id, email, role, is_active')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    orchideaProfile = profileByUser.data
    orchideaError = profileByUser.error

    if (!orchideaProfile && currentUser.email && !orchideaError) {
      const profileByEmail = await supabase
        .from('profiles')
        .select('user_id, email, role, is_active')
        .ilike('email', currentUser.email)
        .maybeSingle()

      orchideaProfile = profileByEmail.data
      orchideaError = profileByEmail.error
    }

    if (orchideaProfile && !orchideaError) {
      const profile = {
        id: orchideaProfile.user_id || currentUser.id,
        email: orchideaProfile.email || currentUser.email,
        role: orchideaProfile.role,
        is_active: orchideaProfile.is_active,
      }
      setProfile(profile)
      return profile
    }

    console.error('Errore caricamento profilo:', novaError || orchideaError)
    setProfile(null)
    return null
  }

  useEffect(() => {
    let isMounted = true

    async function bootstrap() {
      try {
        setLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!isMounted) return

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          await loadProfile(session.user)
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
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (!session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }

      loadProfile(session.user)
        .catch((err) => {
          console.error('Errore onAuthStateChange:', err)
          setProfile(null)
        })
        .finally(() => {
          setLoading(false)
        })
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      throw error
    }

    // Se il database Orchidea Allievi è separato, apro anche lì una sessione con le stesse credenziali.
    // Così Tesserati/Corsi/Insegnanti leggono le tabelle del portale senza errori RLS.
    if (hasDedicatedOrchideaConfig) {
      const { error: orchideaError } = await orchideaSupabase.auth.signInWithPassword({ email, password })
      if (orchideaError) {
        console.warn('Login Orchidea Allievi non riuscito:', orchideaError.message)
      }
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (hasDedicatedOrchideaConfig) {
      await orchideaSupabase.auth.signOut().catch(() => null)
    }
    if (error) throw error
  }

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signOut,
      isAuthenticated: !!user,
      role: String(profile?.role || '').trim().toLowerCase() || null,
      isAdmin: String(profile?.role || '').trim().toLowerCase() === 'admin',
      isActive: profile?.is_active === true,
    }),
    [session, user, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}