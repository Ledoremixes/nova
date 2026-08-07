import { supabase } from './supabase'

function normalize(row = {}) {
  return {
    id: row.id,
    full_name: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    tax_code: row.tax_code || '',
    birth_date: row.birth_date || '',
    birth_place: row.birth_place || '',
    birth_province: row.birth_province || '',
    residence_address: row.residence_address || '',
    residence_city: row.residence_city || '',
    residence_province: row.residence_province || '',
    residence_postal_code: row.residence_postal_code || '',
    role: row.role || 'barman',
    additional_roles: Array.isArray(row.additional_roles) ? row.additional_roles : [],
    duties: row.duties || '',
    venue: row.venue || 'Club Orchidea ASD - Via Giuseppe Ungaretti 34, Saronno (VA)',
    contract_start_date: row.contract_start_date || '2026-09-07',
    contract_end_date: row.contract_end_date || '2027-06-30',
    notice_days: row.notice_days ?? 15,
    signing_place: row.signing_place || 'Saronno',
    notes: row.notes || '',
    active: row.active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

export async function fetchVolunteers({ includePrivate = true } = {}) {
  const publicFields = 'id,full_name,email,phone,role,additional_roles,duties,venue,contract_start_date,contract_end_date,active,created_at,updated_at'
  const { data, error } = await supabase
    .from('sport_volunteers')
    .select(includePrivate ? '*' : publicFields)
    .order('active', { ascending: false })
    .order('full_name', { ascending: true })
  if (error) throw error
  return (data || []).map(normalize)
}

export async function createVolunteer(payload) {
  const { data, error } = await supabase
    .from('sport_volunteers')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return normalize(data)
}

export async function updateVolunteer(id, payload) {
  const { data, error } = await supabase
    .from('sport_volunteers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return normalize(data)
}

export async function deleteVolunteer(id) {
  const { error } = await supabase.from('sport_volunteers').delete().eq('id', id)
  if (error) throw error
  return true
}
