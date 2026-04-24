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
    .select(`
      id,
      user_id,
      section_key,
      list_key,
      label,
      value,
      sort_order,
      is_active,
      report_area,
      report_bucket,
      report_row_code,
      report_row_label,
      created_at
    `)
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
    .select(`
      id,
      user_id,
      section_key,
      list_key,
      label,
      value,
      sort_order,
      is_active,
      report_area,
      report_bucket,
      report_row_code,
      report_row_label,
      created_at
    `)
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
        report_area: payload.report_area || null,
        report_bucket: payload.report_bucket || null,
        report_row_code: payload.report_row_code?.trim() || null,
        report_row_label: payload.report_row_label?.trim() || null,
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
      report_area: payload.report_area || null,
      report_bucket: payload.report_bucket || null,
      report_row_code: payload.report_row_code?.trim() || null,
      report_row_label: payload.report_row_label?.trim() || null,
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