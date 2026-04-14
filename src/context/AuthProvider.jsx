import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../api/supabase'

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

    const { data, error } = await supabase
      .from('users')
      .select('id, email, role, is_active')
      .eq('id', currentUser.id)
      .single()

    if (error) {
      console.error('Errore caricamento profilo:', error)
      setProfile(null)
      return null
    }

    setProfile(data)
    return data
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
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
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
      role: profile?.role || null,
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