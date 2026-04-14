import { supabase } from './supabase'

async function getSignedFileUrl(path, expiresIn = 3600) {
  if (!path) return ''

  const { data, error } = await supabase.storage
    .from('teachers')
    .createSignedUrl(path, expiresIn)

  if (error) {
    console.error('Errore signed url:', error.message)
    return ''
  }

  return data?.signedUrl || ''
}

export async function fetchTeachers({ search = '' }) {
  let query = supabase
    .from('teachers')
    .select('*')
    .order('created_at', { ascending: false })

  if (search.trim()) {
    const q = search.trim()
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message || 'Errore caricamento insegnanti')

  const rows = data || []

  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      if (!row.photo_path) return row

      const signedUrl = await getSignedFileUrl(row.photo_path)
      return {
        ...row,
        photo_signed_url: signedUrl,
      }
    })
  )

  return withSignedUrls
}

export async function createTeacher(payload) {
  const { data, error } = await supabase
    .from('teachers')
    .insert([payload])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore creazione insegnante')
  return data
}

export async function updateTeacher(id, payload) {
  const { data, error } = await supabase
    .from('teachers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore modifica insegnante')
  return data
}

export async function deleteTeacher(id) {
  const { error } = await supabase
    .from('teachers')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Errore eliminazione insegnante')
}

export async function fetchTeacherDocuments(teacherId) {
  const { data, error } = await supabase
    .from('teacher_documents')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('uploaded_at', { ascending: false })

  if (error) throw new Error(error.message || 'Errore caricamento documenti insegnante')
  return data || []
}

export async function uploadTeacherPhoto(file, teacherId) {
  const safeName = file.name.replace(/\s+/g, '_')
  const path = `photos/${teacherId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('teachers')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    throw new Error(uploadError.message || 'Errore upload foto')
  }

  const signedUrl = await getSignedFileUrl(path)

  return {
    photo_path: path,
    photo_url: null,
    photo_signed_url: signedUrl,
  }
}