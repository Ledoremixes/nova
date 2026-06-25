import { supabase } from './supabase'

export async function fetchGestionaleUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, is_active, created_at')
    .order('email', { ascending: true })

  if (error) throw new Error(error.message || 'Errore caricamento utenti')
  return data || []
}

export async function updateGestionaleUser(id, payload) {
  const { data, error } = await supabase
    .from('users')
    .update({
      role: payload.role,
      is_active: payload.is_active,
    })
    .eq('id', id)
    .select('id, email, role, is_active, created_at')
    .single()

  if (error) throw new Error(error.message || 'Errore modifica utente')
  return data
}
