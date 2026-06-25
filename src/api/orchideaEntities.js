import { supabase } from './supabase'
import { orchideaSupabase } from './orchideaSupabase'
import { fetchTesserati, updateTesserato } from './tesserati'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function isMissingTableError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return msg.includes('could not find the table') || msg.includes('schema cache') || (msg.includes('relation') && msg.includes('does not exist'))
}

function normalizeStudent(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    cognome: row.cognome || '',
    nomeCompleto: `${row.nome || ''} ${row.cognome || ''}`.trim(),
    email: row.email || '',
    telefono: row.telefono || row.cellulare || '',
    cf: row.cf || row.cod_fiscale || '',
    numero_tessera: row.numero_tessera || row.codice_tessera || '',
    tessera_attiva: row.tessera_attiva !== false,
    is_corsista: row.is_corsista === true,
    status: row.status || '',
    payment_status: row.payment_status || '',
    stagione: row.stagione || row.anno || '',
    auth_user_id: row.auth_user_id || null,
    created_at: row.created_at || null,
    raw: row,
  }
}

export async function fetchOrchideaStudents({ onlyCorsisti = false } = {}) {
  const rows = await fetchTesserati()
  const normalized = (rows || []).map(normalizeStudent)
  return onlyCorsisti ? normalized.filter((row) => row.is_corsista) : normalized
}

function normalizeCourse(row = {}) {
  const participantRows = row.iscrizioni_corsi || row.iscrizioni || row.partecipanti || []
  return {
    id: row.id,
    nome: row.nome || row.name || row.titolo || 'Corso senza nome',
    disciplina: row.disciplina || row.tipo || '',
    livello: row.livello || '',
    giorno_settimana: row.giorno_settimana || row.giorno || '',
    ora_inizio: row.ora_inizio || row.start_time || '',
    ora_fine: row.ora_fine || row.end_time || '',
    prezzo_mensile: row.prezzo_mensile ?? row.tariffa_mensile ?? row.prezzo ?? null,
    sala: row.sala || '',
    insegnante: row.insegnante || row.teacher_name || '',
    attivo: row.attivo ?? row.is_active ?? true,
    descrizione: row.descrizione || row.description || '',
    colore: row.colore || row.color || '#6d5dfc',
    iscrizioni_corsi: participantRows,
    participants_count: Array.isArray(participantRows) ? participantRows.length : Number(row.participants_count || 0),
    raw: row,
  }
}

export async function fetchOrchideaCourses() {
  const withParticipants = await orchideaSupabase
    .from('corsi')
    .select(`
      *,
      iscrizioni_corsi (
        id,
        stato,
        tesseramento_id,
        tariffa_mensile,
        tipo_pagamento,
        data_iscrizione,
        tesseramenti (id, nome, cognome, email, telefono, cf, numero_tessera, tessera_attiva, is_corsista)
      )
    `)
    .order('attivo', { ascending: false })
    .order('nome', { ascending: true })

  if (!withParticipants.error) {
    return (withParticipants.data || []).map(normalizeCourse)
  }

  if (!isMissingTableError(withParticipants.error)) {
    console.warn('fetchOrchideaCourses with participants:', withParticipants.error)
  }

  const basic = await orchideaSupabase
    .from('corsi')
    .select('*')
    .order('nome', { ascending: true })

  if (basic.error) throw new Error(basic.error.message || 'Errore caricamento corsi Orchidea')
  return (basic.data || []).map(normalizeCourse)
}

export async function fetchCourseParticipants(courseId) {
  if (!courseId) return []

  const res = await orchideaSupabase
    .from('iscrizioni_corsi')
    .select(`
      id,
      stato,
      note,
      tesseramento_id,
      corso_id,
      data_iscrizione,
      tariffa_mensile,
      tipo_pagamento,
      data_inizio,
      data_fine,
      rinnovo_attivo,
      tesseramenti (id, nome, cognome, email, telefono, cf, numero_tessera, tessera_attiva, is_corsista)
    `)
    .eq('corso_id', courseId)
    .order('created_at', { ascending: false })

  if (res.error) {
    if (isMissingTableError(res.error)) return []
    throw new Error(res.error.message || 'Errore caricamento partecipanti')
  }

  return (res.data || []).map((row) => ({
    ...row,
    student: normalizeStudent(row.tesseramenti || {}),
  }))
}

export async function updateOrchideaCourse(id, payload) {
  const clean = {
    nome: payload.nome?.trim() || null,
    disciplina: payload.disciplina?.trim() || null,
    livello: payload.livello?.trim() || null,
    giorno_settimana: payload.giorno_settimana?.trim() || null,
    ora_inizio: payload.ora_inizio || null,
    ora_fine: payload.ora_fine || null,
    prezzo_mensile: payload.prezzo_mensile === '' ? null : Number(payload.prezzo_mensile || 0),
    sala: payload.sala?.trim() || null,
    insegnante: payload.insegnante?.trim() || null,
    descrizione: payload.descrizione?.trim() || null,
    attivo: payload.attivo !== false,
    colore: payload.colore || '#6d5dfc',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await orchideaSupabase
    .from('corsi')
    .update(clean)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Errore modifica corso')
  return normalizeCourse(data)
}

function normalizeTeacher(row = {}, table = 'insegnanti') {
  const fullName = row.full_name || row.nome_completo || row.nome || row.name || [row.cognome, row.nome].filter(Boolean).join(' ')
  const courses = Array.isArray(row.courses)
    ? row.courses
    : text(row.corsi || row.coursesText).split(',').map((item) => item.trim()).filter(Boolean)

  return {
    ...row,
    _table: table,
    id: row.id,
    full_name: fullName || 'Insegnante senza nome',
    email: row.email || '',
    phone: row.phone || row.telefono || row.cellulare || '',
    bio: row.bio || row.descrizione || row.note || '',
    courses,
    photo_url: row.photo_url || row.foto_url || row.avatar_url || '',
    photo_path: row.photo_path || row.foto_path || '',
    active: row.is_active ?? row.attivo ?? true,
    created_at: row.created_at || null,
  }
}

export async function fetchOrchideaTeachers({ search = '' } = {}) {
  const tables = ['insegnanti', 'teachers']
  let lastError = null

  for (const table of tables) {
    let query = orchideaSupabase.from(table).select('*').order('created_at', { ascending: false })
    if (search.trim()) {
      const q = search.trim()
      query = query.or(`nome.ilike.%${q}%,cognome.ilike.%${q}%,full_name.ilike.%${q}%,nome_completo.ilike.%${q}%,email.ilike.%${q}%`)
    }
    const { data, error } = await query
    if (!error) return (data || []).map((row) => normalizeTeacher(row, table))
    lastError = error
  }

  // Fallback sul vecchio archivio Nova, così la sezione resta usabile se il portale allievi non ha ancora la tabella insegnanti.
  let novaQuery = supabase.from('teachers').select('*').order('created_at', { ascending: false })
  if (search.trim()) {
    const q = search.trim()
    novaQuery = novaQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  }
  const nova = await novaQuery
  if (nova.error) throw new Error(lastError?.message || nova.error.message || 'Errore caricamento insegnanti')
  return (nova.data || []).map((row) => normalizeTeacher(row, 'teachers_nova'))
}

function teacherPayloadForTable(payload, table) {
  const courses = text(payload.coursesText || payload.corsi || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (table === 'teachers' || table === 'teachers_nova') {
    return {
      full_name: payload.full_name?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
      bio: payload.bio?.trim() || null,
      courses,
      photo_url: payload.photo_url || null,
      photo_path: payload.photo_path || null,
    }
  }

  return {
    nome: payload.full_name?.trim() || null,
    email: payload.email?.trim() || null,
    telefono: payload.phone?.trim() || null,
    bio: payload.bio?.trim() || null,
    corsi: courses.join(', '),
    foto_url: payload.photo_url || null,
    foto_path: payload.photo_path || null,
    attivo: payload.active !== false,
    updated_at: new Date().toISOString(),
  }
}

export async function createOrchideaTeacher(payload) {
  const table = 'insegnanti'
  const { data, error } = await orchideaSupabase
    .from(table)
    .insert([teacherPayloadForTable(payload, table)])
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Errore creazione insegnante')
  return normalizeTeacher(data, table)
}

export async function updateOrchideaTeacher(row, payload) {
  const table = row?._table || 'insegnanti'
  const client = table === 'teachers_nova' ? supabase : orchideaSupabase
  const realTable = table === 'teachers_nova' ? 'teachers' : table

  const { data, error } = await client
    .from(realTable)
    .update(teacherPayloadForTable(payload, table))
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Errore modifica insegnante')
  return normalizeTeacher(data, table)
}

export async function deleteOrchideaTeacher(row) {
  const table = row?._table || 'insegnanti'
  const client = table === 'teachers_nova' ? supabase : orchideaSupabase
  const realTable = table === 'teachers_nova' ? 'teachers' : table
  const { error } = await client.from(realTable).delete().eq('id', row.id)
  if (error) throw new Error(error.message || 'Errore eliminazione insegnante')
  return true
}

export async function changeTesseratoPassword({ student, newPassword }) {
  if (!student?.auth_user_id && !student?.email) {
    throw new Error('Questo allievo non ha auth_user_id né email collegabile.')
  }
  if (!newPassword || newPassword.length < 6) throw new Error('La password deve avere almeno 6 caratteri.')

  const rpcName = student?.auth_user_id ? 'admin_set_allievo_password' : 'admin_set_allievo_password_by_email'
  const params = student?.auth_user_id
    ? { p_user_id: student.auth_user_id, p_new_password: newPassword }
    : { p_email: String(student.email || '').trim().toLowerCase(), p_new_password: newPassword }

  const { data, error } = await orchideaSupabase.rpc(rpcName, params)

  if (error) throw new Error(error.message || 'Errore modifica password allievo')
  return data
}

export { updateTesserato }
