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


function isPermissionError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('rls') ||
    msg.includes('not authorized') ||
    msg.includes('unauthorized') ||
    msg.includes('jwt')
  )
}

function parseRpcJsonArray(data) {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return Array.isArray(data?.items) ? data.items : []
}

async function rpcJsonArray(functionName, args = {}) {
  const { data, error } = await orchideaSupabase.rpc(functionName, args)
  if (error) throw error
  return parseRpcJsonArray(data)
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
  const teachers = Array.isArray(row.teachers) ? row.teachers : []
  const teacherNames = teachers.map((teacher) => teacher.full_name).filter(Boolean)
  const legacyTeacher = row.insegnante || row.teacher_name || ''
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
    insegnante: teacherNames.join(', ') || legacyTeacher,
    teachers,
    teacher_names: teacherNames,
    attivo: row.attivo ?? row.is_active ?? true,
    descrizione: row.descrizione || row.description || '',
    colore: row.colore || row.color || '#6d5dfc',
    iscrizioni_corsi: participantRows,
    participants_count: Array.isArray(participantRows) ? participantRows.length : Number(row.participants_count || 0),
    raw: row,
  }
}

function courseLegacyTeachers(row = {}) {
  const raw = text(row.insegnante || row.teacher_name || '')
  if (!raw) return []
  return raw
    .split(/,|&|\//)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => normalizeTeacher({ id: `legacy:${lower(name)}`, full_name: name }, 'legacy'))
}

async function enrichCoursesWithTeacherAssignments(courses = []) {
  if (!courses.length) return []

  const byCourse = new Map(courses.map((course) => [String(course.id), []]))

  const { data, error } = await orchideaSupabase
    .from('insegnanti_corsi')
    .select(`
      id,
      corso_id,
      insegnante_id,
      insegnanti (*)
    `)
    .limit(10000)

  if (!error) {
    ;(data || []).forEach((row) => {
      const teacher = row.insegnanti ? normalizeTeacher(row.insegnanti, 'insegnanti') : null
      if (!teacher) return
      const key = String(row.corso_id)
      byCourse.set(key, [...(byCourse.get(key) || []), teacher])
    })
  }

  return courses.map((course) => {
    const assigned = byCourse.get(String(course.id)) || []
    const legacy = courseLegacyTeachers(course.raw || course)
    const merged = []
    const seen = new Set()
    for (const teacher of [...assigned, ...legacy]) {
      const key = lower(teacher.full_name || teacher.id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(teacher)
    }
    return normalizeCourse({ ...course.raw, ...course, teachers: merged, insegnante: merged.map((item) => item.full_name).join(', ') || course.insegnante })
  })
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
    return enrichCoursesWithTeacherAssignments((withParticipants.data || []).map(normalizeCourse))
  }

  if (isPermissionError(withParticipants.error)) {
    const rows = await rpcJsonArray('nova_corsi_list')
    return enrichCoursesWithTeacherAssignments(rows.map(normalizeCourse))
  }

  if (!isMissingTableError(withParticipants.error)) {
    console.warn('fetchOrchideaCourses with participants:', withParticipants.error)
  }

  const basic = await orchideaSupabase
    .from('corsi')
    .select('*')
    .order('nome', { ascending: true })

  if (basic.error) {
    if (isPermissionError(basic.error) || isMissingTableError(basic.error)) {
      const rows = await rpcJsonArray('nova_corsi_list')
      return enrichCoursesWithTeacherAssignments(rows.map(normalizeCourse))
    }
    throw new Error(basic.error.message || 'Errore caricamento corsi Orchidea')
  }
  return enrichCoursesWithTeacherAssignments((basic.data || []).map(normalizeCourse))
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
    if (isPermissionError(res.error)) {
      const rows = await rpcJsonArray('nova_corso_partecipanti', { p_corso_id: courseId })
      return rows.map((row) => ({
        ...row,
        student: normalizeStudent(row.tesseramenti || row.student || {}),
      }))
    }
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

  if (error) {
    if (isPermissionError(error)) {
      const { data: rpcData, error: rpcError } = await orchideaSupabase.rpc('nova_update_corso', {
        p_id: id,
        p_payload: clean,
      })
      if (rpcError) throw new Error(rpcError.message || 'Errore modifica corso')
      return normalizeCourse(rpcData)
    }
    throw new Error(error.message || 'Errore modifica corso')
  }
  return normalizeCourse(data)
}

export async function assignCourseToTeacher({ courseId, teacherId, teacherName }) {
  if (!courseId) throw new Error('Seleziona un corso.')
  const cleanTeacher = text(teacherName)
  if (!teacherId && !cleanTeacher) throw new Error('Insegnante non valido.')

  const insertRes = await orchideaSupabase
    .from('insegnanti_corsi')
    .upsert({
      corso_id: courseId,
      insegnante_id: teacherId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'insegnante_id,corso_id' })
    .select('*')
    .single()

  if (!insertRes.error) {
    return insertRes.data
  }

  if (!isPermissionError(insertRes.error) && !isMissingTableError(insertRes.error)) {
    throw new Error(insertRes.error.message || 'Errore assegnazione corso insegnante')
  }

  const { data: course, error: courseError } = await orchideaSupabase
    .from('corsi')
    .select('id, insegnante')
    .eq('id', courseId)
    .single()

  if (courseError) throw new Error(courseError.message || 'Errore lettura corso')

  const current = courseLegacyTeachers(course || {})
  const names = new Set(current.map((item) => item.full_name))
  if (cleanTeacher) names.add(cleanTeacher)

  const { data, error } = await orchideaSupabase
    .from('corsi')
    .update({ insegnante: [...names].join(', '), updated_at: new Date().toISOString() })
    .eq('id', courseId)
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Errore assegnazione corso insegnante')
  return normalizeCourse(data)
}

export async function removeCourseTeacher({ courseId, teacherId, teacherName }) {
  if (!courseId) throw new Error('Seleziona un corso.')

  const deleteRes = teacherId
    ? await orchideaSupabase.from('insegnanti_corsi').delete().eq('corso_id', courseId).eq('insegnante_id', teacherId)
    : { error: { message: 'missing teacher id' } }

  if (!deleteRes.error) {
    return true
  }

  if (!isPermissionError(deleteRes.error) && !isMissingTableError(deleteRes.error)) {
    throw new Error(deleteRes.error.message || 'Errore rimozione corso insegnante')
  }

  const { data: course, error: courseError } = await orchideaSupabase
    .from('corsi')
    .select('id, insegnante')
    .eq('id', courseId)
    .single()

  if (courseError) throw new Error(courseError.message || 'Errore lettura corso')
  const remaining = courseLegacyTeachers(course || {}).map((item) => item.full_name).filter((name) => lower(name) !== lower(teacherName))

  const { data, error } = await orchideaSupabase
    .from('corsi')
    .update({ insegnante: remaining.join(', '), updated_at: new Date().toISOString() })
    .eq('id', courseId)
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Errore rimozione corso insegnante')
  return normalizeCourse(data)
}

export async function addCourseParticipant({ courseId, studentId, tariffaMensile = null }) {
  if (!courseId || !studentId) throw new Error('Seleziona corso e allievo.')

  const payload = {
    corso_id: courseId,
    tesseramento_id: studentId,
    stato: 'attivo',
    data_iscrizione: new Date().toISOString().slice(0, 10),
    tariffa_mensile: tariffaMensile === '' || tariffaMensile === null ? null : Number(tariffaMensile || 0),
    quota_allievo_mensile: tariffaMensile === '' || tariffaMensile === null ? null : Number(tariffaMensile || 0),
    quota_insegnante_mensile: null,
    percentuale_insegnante: null,
    pacchetto_nome: null,
    pacchetto_totale_mensile: null,
    tipo_pagamento: 'mensile',
    rinnovo_attivo: true,
  }

  const { data, error } = await orchideaSupabase
    .from('iscrizioni_corsi')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    if (isPermissionError(error) || isMissingTableError(error)) {
      const { data: rpcData, error: rpcError } = await orchideaSupabase.rpc('nova_iscrivi_allievo_corso', {
        p_corso_id: courseId,
        p_tesseramento_id: studentId,
        p_tariffa_mensile: payload.tariffa_mensile,
      })
      if (rpcError) throw new Error(rpcError.message || 'Errore iscrizione allievo')
      return rpcData
    }
    throw new Error(error.message || 'Errore iscrizione allievo')
  }

  return data
}

export async function removeCourseParticipant(enrollmentId) {
  if (!enrollmentId) return null

  const { error } = await orchideaSupabase
    .from('iscrizioni_corsi')
    .delete()
    .eq('id', enrollmentId)

  if (error) {
    if (isPermissionError(error) || isMissingTableError(error)) {
      const { data: rpcData, error: rpcError } = await orchideaSupabase.rpc('nova_rimuovi_iscrizione_corso', {
        p_iscrizione_id: enrollmentId,
      })
      if (rpcError) throw new Error(rpcError.message || 'Errore rimozione iscrizione')
      return rpcData
    }
    throw new Error(error.message || 'Errore rimozione iscrizione')
  }

  return true
}

export async function updateCourseEnrollmentPricing({ enrollmentId, payload = {} }) {
  if (!enrollmentId) throw new Error('Iscrizione corso non selezionata.')

  const clean = {
    quota_allievo_mensile: payload.quota_allievo_mensile === '' || payload.quota_allievo_mensile === null || payload.quota_allievo_mensile === undefined
      ? null
      : Math.max(0, Number(payload.quota_allievo_mensile || 0)),
    tariffa_mensile: payload.quota_allievo_mensile === '' || payload.quota_allievo_mensile === null || payload.quota_allievo_mensile === undefined
      ? null
      : Math.max(0, Number(payload.quota_allievo_mensile || 0)),
    quota_insegnante_mensile: payload.quota_insegnante_mensile === '' || payload.quota_insegnante_mensile === null || payload.quota_insegnante_mensile === undefined
      ? null
      : Math.max(0, Number(payload.quota_insegnante_mensile || 0)),
    percentuale_insegnante: payload.percentuale_insegnante === '' || payload.percentuale_insegnante === null || payload.percentuale_insegnante === undefined
      ? null
      : Math.max(0, Number(payload.percentuale_insegnante || 0)),
    pacchetto_nome: payload.pacchetto_nome?.trim?.() || null,
    pacchetto_totale_mensile: payload.pacchetto_totale_mensile === '' || payload.pacchetto_totale_mensile === null || payload.pacchetto_totale_mensile === undefined
      ? null
      : Number(payload.pacchetto_totale_mensile || 0),
    note_pacchetto: payload.note_pacchetto?.trim?.() || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await orchideaSupabase
    .from('iscrizioni_corsi')
    .update(clean)
    .eq('id', enrollmentId)
    .select('*')
    .single()

  if (error) {
    if (isPermissionError(error) || isMissingTableError(error)) {
      const { data: rpcData, error: rpcError } = await orchideaSupabase.rpc('nova_aggiorna_quota_iscrizione', {
        p_iscrizione_id: enrollmentId,
        p_quota_allievo: clean.quota_allievo_mensile,
        p_quota_insegnante: clean.quota_insegnante_mensile,
        p_percentuale_insegnante: clean.percentuale_insegnante,
        p_pacchetto_nome: clean.pacchetto_nome,
        p_pacchetto_totale: clean.pacchetto_totale_mensile,
        p_note: clean.note_pacchetto,
      })
      if (rpcError) throw new Error(rpcError.message || 'Errore aggiornamento quota iscrizione.')
      return rpcData
    }
    throw new Error(error.message || 'Errore aggiornamento quota iscrizione.')
  }

  return data
}

export async function saveStudentPackage({ studentId, packageName = 'Pacchetto mensile', packageTotal = null, note = '', rows = [] }) {
  if (!studentId) throw new Error('Allievo non selezionato.')
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Nessun corso da aggiornare.')

  const total = packageTotal === '' || packageTotal === null || packageTotal === undefined ? null : Number(packageTotal || 0)
  const updates = rows.map((row) => updateCourseEnrollmentPricing({
    enrollmentId: row.id,
    payload: {
      quota_allievo_mensile: row.quota_allievo_mensile,
      quota_insegnante_mensile: row.quota_insegnante_mensile,
      percentuale_insegnante: row.percentuale_insegnante,
      pacchetto_nome: packageName,
      pacchetto_totale_mensile: total,
      note_pacchetto: note,
    },
  }))

  return Promise.all(updates)
}


export async function fetchStudentPackageDetails(studentId) {
  if (!studentId) return { enrollments: [] }

  const fullSelect = `
    id,
    stato,
    note,
    tesseramento_id,
    corso_id,
    data_iscrizione,
    tariffa_mensile,
    quota_allievo_mensile,
    quota_insegnante_mensile,
    percentuale_insegnante,
    note_pacchetto,
    tipo_pagamento,
    data_inizio,
    data_fine,
    rinnovo_attivo,
    pacchetto_nome,
    pacchetto_totale_mensile,
    quota_pacchetto_percentuale,
    created_at,
    updated_at,
    corsi(id, nome, livello, giorno_settimana, ora_inizio, ora_fine, prezzo_mensile, insegnante)
  `

  const basicSelect = `
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
    created_at,
    corsi(id, nome, livello, giorno_settimana, ora_inizio, ora_fine, prezzo_mensile)
  `

  async function run(selectText) {
    return orchideaSupabase
      .from('iscrizioni_corsi')
      .select(selectText)
      .eq('tesseramento_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1000)
  }

  let res = await run(fullSelect)
  if (res.error && isMissingTableError(res.error)) return { enrollments: [] }
  if (res.error) {
    const retry = await run(basicSelect)
    if (retry.error) {
      if (isPermissionError(retry.error) || isMissingTableError(retry.error)) return { enrollments: [] }
      throw new Error(retry.error.message || 'Errore caricamento corsi collegati.')
    }
    res = retry
  }

  return { enrollments: res.data || [] }
}

function monthNameToNumber(value) {
  const months = {
    gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
    luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
  }
  return months[lower(value)] || ''
}

function paymentMatchesMonth(row, selectedMonth) {
  const periodo = text(row.periodo || row.mese || row.scadenza || row.data_pagamento || row.pagato_il)
  if (!periodo) return false
  if (periodo.slice(0, 7) === selectedMonth) return true

  const monthNameMatch = lower(periodo).match(/(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/)
  if (monthNameMatch) {
    return `${monthNameMatch[2]}-${monthNameToNumber(monthNameMatch[1])}` === selectedMonth
  }

  const date = new Date(periodo)
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 7) === selectedMonth
  }
  return false
}

function teacherPaymentConfig(row = {}) {
  const paymentType = row.payment_type || row.tipo_compenso || row.pagamento_tipo || row.metodo_compenso || row.compenso_tipo || 'percentuale'
  const fixed = row.fixed_monthly_compensation ?? row.compenso_fisso_mensile ?? row.compenso_default_mensile ?? row.compenso_fisso ?? row.quota_fissa_mensile ?? null
  const percent = row.percentage_compensation ?? row.percentuale_compenso ?? row.percentuale_default ?? row.percentuale_default_insegnante ?? null
  const hourly = row.hourly_rate ?? row.compenso_orario ?? row.tariffa_oraria ?? row.quota_oraria ?? null
  return { paymentType, fixed, percent, hourly }
}

function parseWeekday(value) {
  const key = lower(value)
  const map = {
    lunedi: 1, 'lunedì': 1, monday: 1,
    martedi: 2, 'martedì': 2, tuesday: 2,
    mercoledi: 3, 'mercoledì': 3, wednesday: 3,
    giovedi: 4, 'giovedì': 4, thursday: 4,
    venerdi: 5, 'venerdì': 5, friday: 5,
    sabato: 6, saturday: 6,
    domenica: 0, sunday: 0,
  }
  return map[key]
}

function parseTimeToMinutes(value) {
  const raw = text(value)
  if (!raw) return null
  const [hh, mm = '0'] = raw.split(':')
  const hours = Number(hh)
  const mins = Number(mm)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

function countWeekdayOccurrences(selectedMonth, weekday) {
  if (weekday === undefined || weekday === null) return 0
  const year = Number(selectedMonth.slice(0, 4))
  const monthIndex = Number(selectedMonth.slice(5, 7)) - 1
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  let count = 0
  for (let day = 1; day <= lastDay; day += 1) {
    const current = new Date(year, monthIndex, day)
    if (current.getDay() === weekday) count += 1
  }
  return count
}

function monthlyCourseHours(course, selectedMonth) {
  const weekday = parseWeekday(course.giorno_settimana)
  const start = parseTimeToMinutes(course.ora_inizio)
  const end = parseTimeToMinutes(course.ora_fine)
  if (weekday === undefined || start === null || end === null || end <= start) return 0
  const hoursPerLesson = (end - start) / 60
  return countWeekdayOccurrences(selectedMonth, weekday) * hoursPerLesson
}

export async function fetchTeacherMonthlyPayouts({ month = '' } = {}) {
  const selectedMonth = month || new Date().toISOString().slice(0, 7)
  const monthStart = `${selectedMonth}-01`
  const monthEnd = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).toISOString().slice(0, 10)

  const [enrollmentsRes, paymentsRes, teachers, courses] = await Promise.all([
    orchideaSupabase
      .from('iscrizioni_corsi')
      .select(`
        id,
        stato,
        tesseramento_id,
        corso_id,
        tariffa_mensile,
        quota_allievo_mensile,
        quota_insegnante_mensile,
        percentuale_insegnante,
        data_iscrizione,
        data_inizio,
        data_fine,
        rinnovo_attivo,
        tesseramenti (id, nome, cognome)
      `)
      .limit(10000),
    orchideaSupabase.from('pagamenti').select('*').limit(10000),
    fetchOrchideaTeachers({ search: '' }).catch(() => []),
    fetchOrchideaCourses().catch(() => []),
  ])

  if (enrollmentsRes.error) {
    if (isPermissionError(enrollmentsRes.error) || isMissingTableError(enrollmentsRes.error)) return []
    throw new Error(enrollmentsRes.error.message || 'Errore caricamento compensi insegnanti.')
  }

  const paidByStudent = new Map()
  if (!paymentsRes.error) {
    ;(paymentsRes.data || []).forEach((payment) => {
      const state = lower(payment.stato || payment.status)
      if (!['pagato', 'paid', 'coperto'].includes(state)) return
      if (!paymentMatchesMonth(payment, selectedMonth)) return
      const studentId = text(payment.tesseramento_id || payment.allievo_id || payment.student_id)
      if (!studentId) return
      paidByStudent.set(studentId, (paidByStudent.get(studentId) || 0) + Number(payment.importo || payment.amount || 0))
    })
  }

  const courseById = new Map((courses || []).map((course) => [String(course.id), course]))
  const activeRows = (enrollmentsRes.data || []).filter((row) => {
    const state = lower(row.stato || '')
    if (['annullato', 'rimosso', 'cancellato', 'inactive', 'non_attivo'].includes(state)) return false
    if (row.rinnovo_attivo === false) return false
    const start = row.data_inizio || row.data_iscrizione || null
    const end = row.data_fine || null
    if (start && String(start).slice(0, 10) > monthEnd) return false
    if (end && String(end).slice(0, 10) < monthStart) return false
    return paidByStudent.has(String(row.tesseramento_id || ''))
  }).map((row) => ({
    ...row,
    course: courseById.get(String(row.corso_id)) || null,
    student_name: [row.tesseramenti?.nome, row.tesseramenti?.cognome].filter(Boolean).join(' ') || 'Allievo',
    student_quota: Math.max(0, Number(row.quota_allievo_mensile ?? row.tariffa_mensile ?? courseById.get(String(row.corso_id))?.prezzo_mensile ?? 0)),
  }))

  const payouts = (teachers || []).map((teacher) => {
    const config = teacherPaymentConfig(teacher || {})
    const assignedCourses = (courses || []).filter((course) => (course.teachers || []).some((item) => lower(item.full_name) === lower(teacher.full_name) || String(item.id) === String(teacher.id)))
    const assignedCourseIds = new Set(assignedCourses.map((course) => String(course.id)))
    const rows = activeRows.filter((row) => assignedCourseIds.has(String(row.corso_id)))
    const paidTotal = rows.reduce((sum, row) => sum + row.student_quota, 0)
    const studentsCount = new Set(rows.map((row) => row.tesseramento_id)).size
    const paidCourseIds = [...new Set(rows.map((row) => String(row.corso_id)))]

    let total = 0
    let detailRows = []

    if (lower(config.paymentType).includes('orar')) {
      detailRows = assignedCourses
        .filter((course) => paidCourseIds.includes(String(course.id)))
        .map((course) => {
          const hours = monthlyCourseHours(course, selectedMonth)
          const rate = Number(config.hourly || 0)
          const teacherQuota = hours * rate
          total += teacherQuota
          return {
            enrollment_id: `${teacher.id}-${course.id}-${selectedMonth}`,
            course_name: course.nome || 'Corso',
            course_level: course.livello || '',
            student_name: `${hours.toFixed(2)} ore nel mese`,
            student_quota: 0,
            teacher_quota: teacherQuota,
            percentuale_insegnante: null,
            method: `${rate.toFixed(2)} €/h`,
          }
        })
    } else if (lower(config.paymentType).includes('fiss')) {
      total = rows.length > 0 ? Number(config.fixed || 0) : 0
      detailRows = total > 0 ? [{
        enrollment_id: `${teacher.id}-${selectedMonth}`,
        course_name: 'Compenso mensile fisso',
        course_level: '',
        student_name: `${studentsCount} allievi paganti`,
        student_quota: paidTotal,
        teacher_quota: total,
        percentuale_insegnante: null,
        method: 'quota fissa mensile',
      }] : []
    } else {
      const percent = Number(config.percent || 0)
      detailRows = rows.map((row) => {
        const teacherQuota = row.student_quota * percent / 100
        total += teacherQuota
        return {
          enrollment_id: `${teacher.id}-${row.id}`,
          course_name: row.course?.nome || 'Corso',
          course_level: row.course?.livello || '',
          student_name: row.student_name,
          student_quota: row.student_quota,
          teacher_quota: teacherQuota,
          percentuale_insegnante: percent,
          method: `${percent}% su quota pagata`,
        }
      })
    }

    return {
      key: lower(teacher.full_name) || String(teacher.id),
      teacher_name: teacher.full_name,
      month: selectedMonth,
      total,
      students_count: studentsCount,
      courses_count: new Set(assignedCourses.map((course) => course.nome)).size,
      rows: detailRows,
    }
  })

  return payouts.sort((a, b) => b.total - a.total)
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
    payment_type: row.payment_type || row.tipo_compenso || row.pagamento_tipo || row.metodo_compenso || row.compenso_tipo || 'percentuale',
    fixed_monthly_compensation: row.fixed_monthly_compensation ?? row.compenso_fisso_mensile ?? row.compenso_default_mensile ?? row.compenso_fisso ?? row.quota_fissa_mensile ?? '',
    percentage_compensation: row.percentage_compensation ?? row.percentuale_compenso ?? row.percentuale_default ?? row.percentuale_default_insegnante ?? '',
    hourly_rate: row.hourly_rate ?? row.compenso_orario ?? row.tariffa_oraria ?? row.quota_oraria ?? '',
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
      payment_type: payload.payment_type || 'percentuale',
      fixed_monthly_compensation: payload.fixed_monthly_compensation === '' || payload.fixed_monthly_compensation === null || payload.fixed_monthly_compensation === undefined ? null : Number(payload.fixed_monthly_compensation || 0),
      percentage_compensation: payload.percentage_compensation === '' || payload.percentage_compensation === null || payload.percentage_compensation === undefined ? null : Number(payload.percentage_compensation || 0),
      hourly_rate: payload.hourly_rate === '' || payload.hourly_rate === null || payload.hourly_rate === undefined ? null : Number(payload.hourly_rate || 0),
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
    pagamento_tipo: payload.payment_type || 'percentuale',
    compenso_fisso_mensile: payload.fixed_monthly_compensation === '' || payload.fixed_monthly_compensation === null || payload.fixed_monthly_compensation === undefined ? null : Number(payload.fixed_monthly_compensation || 0),
    percentuale_compenso: payload.percentage_compensation === '' || payload.percentage_compensation === null || payload.percentage_compensation === undefined ? null : Number(payload.percentage_compensation || 0),
    compenso_orario: payload.hourly_rate === '' || payload.hourly_rate === null || payload.hourly_rate === undefined ? null : Number(payload.hourly_rate || 0),
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
