import { supabase } from './supabase'

export async function saveAssistedCorsistaMembership(payload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Sessione Nova non disponibile. Accedi di nuovo e riprova.')
  }

  const response = await fetch('/api/orchidea-assisted-membership', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify(payload),
  })

  let body = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }

  if (!response.ok) {
    throw new Error(body.error || 'Errore durante il tesseramento assistito.')
  }

  if (!body.student?.id) throw new Error('Tesseramento salvato, ma Nova non ha ricevuto l’identificativo del corsista.')
  return body
}
