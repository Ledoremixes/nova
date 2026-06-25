import { supabase } from './supabase'

export async function fetchAccountProfile(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('account_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Errore caricamento profilo account')
  return data || null
}

export async function upsertAccountProfile(userId, payload) {
  const { data, error } = await supabase
    .from('account_profiles')
    .upsert({
      user_id: userId,
      full_name: payload.full_name?.trim() || null,
      phone: payload.phone?.trim() || null,
      notification_email: payload.notification_email?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore salvataggio profilo account')
  return data
}

export async function updateOwnPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('La password deve avere almeno 6 caratteri.')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message || 'Errore modifica password')
  return true
}

export async function updateOwnEmail(newEmail) {
  if (!newEmail) throw new Error('Inserisci una nuova email.')
  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw new Error(error.message || 'Errore modifica email')
  return true
}
