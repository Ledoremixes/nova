import { supabase } from './supabase'
import { fetchOrchideaStudents } from './orchideaEntities'

async function signedUrl(path) {
  if (!path) return ''
  const { data, error } = await supabase.storage.from('medical-visits').createSignedUrl(path, 3600)
  if (error) return ''
  return data?.signedUrl || ''
}

export async function fetchMedicalStudents() {
  return fetchOrchideaStudents({ onlyCorsisti: true })
}

export async function fetchMedicalVisits() {
  const { data, error } = await supabase
    .from('medical_visits')
    .select('*')
    .order('expires_at', { ascending: true, nullsFirst: false })

  if (error) throw new Error(error.message || 'Errore caricamento visite mediche')
  const rows = data || []
  return Promise.all(rows.map(async (row) => ({ ...row, file_signed_url: await signedUrl(row.file_path) })))
}

export async function createMedicalVisit({ student, payload, file }) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error(authError.message || 'Errore autenticazione')
  const user = authData.user
  if (!user) throw new Error('Utente non autenticato')

  let filePath = null
  let fileName = null
  let fileMime = null

  if (file) {
    const ext = file.name.split('.').pop()
    fileName = file.name
    fileMime = file.type
    filePath = `${student.id}/${Date.now()}-${file.name.replace(/\s+/g, '_')}.${ext || 'file'}`
    const { error: uploadError } = await supabase.storage.from('medical-visits').upload(filePath, file, { upsert: true })
    if (uploadError) throw new Error(uploadError.message || 'Errore upload visita medica')
  }

  const { data, error } = await supabase
    .from('medical_visits')
    .insert([{
      user_id: user.id,
      tesseramento_id: student.id,
      student_name: student.nomeCompleto,
      student_email: student.email || null,
      issued_at: payload.issued_at || null,
      expires_at: payload.expires_at || null,
      doctor: payload.doctor?.trim() || null,
      notes: payload.notes?.trim() || null,
      file_path: filePath,
      file_name: fileName,
      file_mime: fileMime,
      status: payload.status || 'valida',
    }])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore salvataggio visita medica')
  return data
}

export async function deleteMedicalVisit(id) {
  const { error } = await supabase.from('medical_visits').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Errore eliminazione visita')
  return true
}
