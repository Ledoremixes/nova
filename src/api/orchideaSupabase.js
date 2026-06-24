import { createClient } from '@supabase/supabase-js'
import { supabase as novaSupabase } from './supabase'

const novaUrl = import.meta.env.VITE_SUPABASE_URL || ''
const novaAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const orchideaUrl = import.meta.env.VITE_ORCHIDEA_SUPABASE_URL || ''
const orchideaAnonKey = import.meta.env.VITE_ORCHIDEA_SUPABASE_ANON_KEY || ''

const hasDedicatedUrl = Boolean(orchideaUrl && orchideaUrl !== novaUrl)
const hasDedicatedKey = Boolean(orchideaAnonKey && orchideaAnonKey !== novaAnonKey)

export const hasDedicatedOrchideaConfig = Boolean(orchideaUrl && orchideaAnonKey && (hasDedicatedUrl || hasDedicatedKey))

// Client separato per il database usato da orchidea-allievi.
// Deve avere una propria sessione auth: le policy RLS del portale allievi
// non leggono la sessione del database Nova.
export const orchideaSupabase = hasDedicatedOrchideaConfig
  ? createClient(orchideaUrl, orchideaAnonKey, {
      auth: {
        storageKey: 'nova-orchidea-allievi-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : novaSupabase

export function getOrchideaConfigStatus() {
  if (hasDedicatedOrchideaConfig) {
    return {
      mode: 'dedicated',
      label: 'Database Orchidea Allievi',
      message:
        'Database Orchidea Allievi configurato. Per vedere i tesserati serve anche una sessione valida sul portale allievi.',
    }
  }

  return {
    mode: 'nova',
    label: 'Database Nova',
    message:
      'La sezione tesserati sta usando il database Nova. Per leggere i tesserati reali del portale allievi configura VITE_ORCHIDEA_SUPABASE_URL e VITE_ORCHIDEA_SUPABASE_ANON_KEY.',
  }
}

export async function getOrchideaSession() {
  if (!hasDedicatedOrchideaConfig) {
    const {
      data: { session },
      error,
    } = await novaSupabase.auth.getSession()
    return { session, error }
  }

  const {
    data: { session },
    error,
  } = await orchideaSupabase.auth.getSession()

  return { session, error }
}

export async function getOrchideaAuthStatus() {
  const { session, error } = await getOrchideaSession()

  return {
    configured: hasDedicatedOrchideaConfig,
    authenticated: Boolean(session?.user),
    email: session?.user?.email || null,
    userId: session?.user?.id || null,
    error: error?.message || null,
  }
}
