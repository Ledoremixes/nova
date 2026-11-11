import { supabase } from './supabase'

async function requestTokenRules(method = 'GET', payload = null) {
  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const token = data?.session?.access_token
  if (!token) throw new Error('Sessione Nova non disponibile. Accedi nuovamente.')
  const response = await fetch('/api/nova-teacher-token-rules', {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'Errore caricamento impostazioni gettoni.')
  return result
}

export async function fetchTeacherTokenRules() {
  const data = await requestTokenRules()
  return Array.isArray(data.rules) ? data.rules : []
}

export async function saveTeacherTokenRule({ courseId, includeTokens, effectiveFrom = '2026-11' }) {
  return requestTokenRules('POST', { courseId, includeTokens, effectiveFrom })
}
