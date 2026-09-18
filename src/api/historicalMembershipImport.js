import { supabase } from './supabase'
import { invalidateTesseratiCache } from './tesserati'

export async function importHistoricalMembershipBatch({ format, version, defaults, records }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Sessione Nova non disponibile. Accedi di nuovo e riprova.')
  }

  const response = await fetch('/api/orchidea-historical-memberships', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({ format, version, defaults, records }),
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }

  if (!response.ok) {
    throw new Error(body.error || 'Errore durante l’importazione dei tesseramenti storici.')
  }

  invalidateTesseratiCache()
  return body.summary
}
