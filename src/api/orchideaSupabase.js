import { createClient } from '@supabase/supabase-js'
import { supabase as novaSupabase } from './supabase'

const novaUrl = import.meta.env.VITE_SUPABASE_URL || ''
const novaAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const orchideaUrl = import.meta.env.VITE_ORCHIDEA_SUPABASE_URL || ''
const orchideaAnonKey = import.meta.env.VITE_ORCHIDEA_SUPABASE_ANON_KEY || ''

const hasDedicatedUrl = Boolean(orchideaUrl && orchideaUrl !== novaUrl)
const hasDedicatedKey = Boolean(orchideaAnonKey && orchideaAnonKey !== novaAnonKey)

export const hasDedicatedOrchideaConfig = Boolean(orchideaUrl && orchideaAnonKey && (hasDedicatedUrl || hasDedicatedKey))

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
      message: 'La sezione tesserati usa il database separato di orchidea-allievi.',
    }
  }

  return {
    mode: 'nova',
    label: 'Database Nova',
    message:
      'La sezione tesserati sta usando il database Nova. Per leggere i tesserati reali del portale allievi configura VITE_ORCHIDEA_SUPABASE_URL e VITE_ORCHIDEA_SUPABASE_ANON_KEY.',
  }
}
