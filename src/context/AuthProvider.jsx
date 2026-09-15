import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../api/supabase'
import { orchideaSupabase, hasDedicatedOrchideaConfig } from '../api/orchideaSupabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const authTransitionRef = useRef(false)
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

        // Il client Orchidea usa uno storage/sessione separati. Aspettiamo che
        // Supabase abbia reidratato anche quella sessione prima di montare le
        // pagine operative, altrimenti la prima query può partire troppo presto
        // e mostrare ORCHIDEA_AUTH_REQUIRED fino al refresh.
        if (hasDedicatedOrchideaConfig) {
          await orchideaSupabase.auth.getSession().catch(() => null)
        }

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
        if (!authTransitionRef.current) setLoading(false)
        return
      }

      loadProfile(session.user)
        .catch((err) => {
          console.error('Errore onAuthStateChange:', err)
          setProfile(null)
        })
        .finally(() => {
          // Durante signIn() dobbiamo aspettare anche l'autenticazione sul
          // database Orchidea. Senza questa guardia React poteva entrare in
          // Tesserati mentre il secondo login era ancora in corso.
          if (!authTransitionRef.current) setLoading(false)
        })
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    authTransitionRef.current = true
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Se il database Orchidea Allievi è separato, completiamo PRIMA anche
      // questo login. Solo dopo rendiamo disponibile il gestionale: così le
      // prime query non partono con una sessione Orchidea ancora assente.
      if (hasDedicatedOrchideaConfig) {
        const { error: orchideaError } = await orchideaSupabase.auth.signInWithPassword({ email, password })
        if (orchideaError) {
          console.warn('Login Orchidea Allievi non riuscito:', orchideaError.message)
        } else {
          // Forza la lettura della sessione appena creata prima di sbloccare UI/query.
          await orchideaSupabase.auth.getSession().catch(() => null)
        }
      }

      const currentUser = data?.user || data?.session?.user || null
      if (currentUser) {
        setSession(data?.session || null)
        setUser(currentUser)
        await loadProfile(currentUser)
      }

      // Evita che passando da un account all'altro rimangano in cache errori
      // o dati provenienti dalla sessione precedente.
      queryClient.clear()
    } finally {
      authTransitionRef.current = false
      setLoading(false)
    }
  }

  async function signOut() {
    authTransitionRef.current = true
    setLoading(true)

    try {
      // Chiudiamo entrambe le sessioni prima di riportare l'utente al login.
      // In questo modo il successivo account non eredita per pochi istanti la
      // vecchia sessione Orchidea.
      if (hasDedicatedOrchideaConfig) {
        await orchideaSupabase.auth.signOut().catch(() => null)
      }

      const { error } = await supabase.auth.signOut()
      queryClient.clear()
      if (error) throw error
    } finally {
      authTransitionRef.current = false
      setLoading(false)
    }
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
