import { supabase } from './supabase'

export async function createQuickCorsista(payload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Sessione Nova non disponibile. Accedi di nuovo e riprova.')
  }

  const response = await fetch('/api/orchidea-students', {
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
    throw new Error(body.error || 'Errore durante la creazione del corsista.')
  }

  if (!body.student?.id) throw new Error('Il corsista è stato creato ma Nova non ha ricevuto il suo identificativo.')
  return body
}
