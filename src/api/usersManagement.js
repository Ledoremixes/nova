import { supabase } from './supabase'

async function adminRequest(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessione admin non disponibile.')
  const response = await fetch('/api/admin-users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Errore gestione utenti')
  return payload
}

export async function fetchGestionaleUsers() {
  return adminRequest('GET')
}

export async function createGestionaleUser(payload) {
  return adminRequest('POST', payload)
}

export async function updateGestionaleUser(id, payload) {
  return adminRequest('PATCH', { id, ...payload })
}

export async function deleteGestionaleUser(id) {
  return adminRequest('DELETE', { id })
}
