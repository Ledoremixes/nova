import { createClient } from '@supabase/supabase-js'
import { supabase as novaSupabase } from './supabase'

const novaUrl = import.meta.env.VITE_SUPABASE_URL || ''
const novaAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const orchideaUrl = import.meta.env.VITE_ORCHIDEA_SUPABASE_URL || ''
const orchideaAnonKey = import.meta.env.VITE_ORCHIDEA_SUPABASE_ANON_KEY || ''

const hasDedicatedUrl = Boolean(orchideaUrl && orchideaUrl !== novaUrl)
const hasDedicatedKey = Boolean(orchideaAnonKey && orchideaAnonKey !== novaAnonKey)

export const hasDedicatedOrchideaConfig = Boolean(orchideaUrl && orchideaAnonKey && (hasDedicatedUrl || hasDedicatedKey))

// Safety switch: disabled by default in production. Enable only after
// controlled staff testing; switching the transport does not change auth/RLS.
export const shouldUseOrchideaServerBridge = import.meta.env.VITE_NOVA_ORCHIDEA_SECURE_BRIDGE === 'true'

// Only the Nova server performs privileged queries against the Orchidea DB.
// The Nova browser never receives the service-role key. This custom transport
// keeps the existing PostgREST query builders working (including rpc/range).
const PROXY_REQUEST_HEADERS = [
  'accept', 'content-type', 'prefer', 'range',
  'accept-profile', 'content-profile', 'if-match', 'if-none-match',
]
async function novaAuthorizedOrchideaFetch(input, init) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/rest/v1/')) {
    // Supabase Auth uses its own endpoint/session; do not redirect it.
    return fetch(input, init)
  }
  const { data: sessionData, error: authError } = await novaSupabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (authError || !accessToken) {
    return new Response(JSON.stringify({ message: 'Sessione Nova non valida: accedi nuovamente.' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    })
  }
  const forwardedHeaders = {}
  for (const header of PROXY_REQUEST_HEADERS) {
    const value = request.headers.get(header)
    if (value !== null) forwardedHeaders[header] = value
  }
  const rawBody = request.method === 'GET' || request.method === 'HEAD'
    ? undefined : await request.clone().text()
  return fetch('/api/orchidea-payments-read', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({
      operation: 'postgrest-bridge',
      path: url.pathname + url.search,
      httpMethod: request.method,
      headers: forwardedHeaders,
      rawBody,
    }),
    signal: request.signal,
  })
}

// Client separato per il database usato da orchidea-allievi.
// Deve avere una propria sessione auth: le policy RLS del portale allievi
// non leggono la sessione del database Nova.
export const orchideaSupabase = hasDedicatedOrchideaConfig
  ? createClient(orchideaUrl, orchideaAnonKey, {
      ...(shouldUseOrchideaServerBridge ? { global: { fetch: novaAuthorizedOrchideaFetch } } : {}),
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
