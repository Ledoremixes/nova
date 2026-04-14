import { supabase } from './supabase'

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) throw new Error('Utente non autenticato')
  return user.id
}

export async function fetchLookupOptions() {
  const { data, error } = await supabase
    .from('lookup_options')
    .select('*')
    .order('section_key', { ascending: true })
    .order('list_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchLookupList(sectionKey, listKey, onlyActive = true) {
  let query = supabase
    .from('lookup_options')
    .select('*')
    .eq('section_key', sectionKey)
    .eq('list_key', listKey)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (onlyActive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createLookupOption(payload) {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase
    .from('lookup_options')
    .insert([
      {
        user_id: userId,
        section_key: payload.section_key,
        list_key: payload.list_key,
        label: payload.label.trim(),
        value: payload.value?.trim() || null,
        sort_order: Number(payload.sort_order || 0),
        is_active: payload.is_active !== false,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLookupOption(id, payload) {
  const { data, error } = await supabase
    .from('lookup_options')
    .update({
      label: payload.label.trim(),
      value: payload.value?.trim() || null,
      sort_order: Number(payload.sort_order || 0),
      is_active: payload.is_active !== false,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteLookupOption(id) {
  const { error } = await supabase
    .from('lookup_options')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}