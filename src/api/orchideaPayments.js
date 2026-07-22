import dayjs from 'dayjs'
import { orchideaSupabase } from './orchideaSupabase'
import { summarizeMonthlyTuitionPayments } from '../lib/paymentLedger'

export function euro(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function safeCourses(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePaymentRow(row = {}) {
  const courses = safeCourses(row.corsi || row.courses || row.corsi_collegati)
  const total = Number(row.quota_mese ?? row.totale_mese ?? row.amount_due ?? 0)
  const paid = Number(row.pagato ?? row.paid_amount ?? row.totale_pagato ?? 0)
  const status = row.stato_pagamento || row.status || row.stato || (paid >= total && total > 0 ? 'pagato' : paid > 0 ? 'parziale' : 'da_pagare')
  const residue = Number(row.residuo ?? Math.max(total - paid, 0))

  return {
    id: row.tesseramento_id || row.id,
    tesseramento_id: row.tesseramento_id || row.id,
    nome: row.nome || '',
    cognome: row.cognome || '',
    nomeCompleto: row.nome_completo || `${row.nome || ''} ${row.cognome || ''}`.trim() || 'Senza nome',
    email: row.email || '',
    cf: row.cf || row.codice_fiscale || '',
    telefono: row.telefono || '',
    numero_tessera: row.numero_tessera || row.codice_tessera || '',
    formula: row.formula || (courses.length > 1 ? 'Multicorso' : 'Mensile'),
    tipo_pacchetto: row.tipo_pacchetto || (courses.length > 1 ? 'Pacchetto multicorso' : 'Corso singolo'),
    copertura_dal: row.copertura_dal || dayjs(`${row.mese || dayjs().format('YYYY-MM')}-01`).format('YYYY-MM-DD'),
    copertura_al: row.copertura_al || dayjs(`${row.mese || dayjs().format('YYYY-MM')}-01`).endOf('month').format('YYYY-MM-DD'),
    mese: row.mese || dayjs().format('YYYY-MM'),
    quota_mese: total,
    pagato: paid,
    residuo: Math.max(residue, 0),
    stato_pagamento: status,
    pagamento_id: row.pagamento_id || null,
    metodo_pagamento: row.metodo_pagamento || '',
    nota_pagamento: row.nota_pagamento || '',
    data_pagamento: row.data_pagamento || null,
    payment_source: row.payment_source || 'none',
    payment_records_count: Number(row.payment_records_count || 0),
    payment_ignored_excess: Number(row.payment_ignored_excess || 0),
    corsi: courses,
  }
}

function isEnrollmentActive(row, monthStart, monthEnd) {
  const state = normalizeText(row.stato || row.status)
  if (['annullato', 'rimosso', 'cancellato', 'inactive', 'non_attivo'].includes(state)) return false
  if (row.rinnovo_attivo === false) return false

  const start = row.data_inizio || row.data_iscrizione || row.created_at
  const end = row.data_fine || row.scadenza || null
  if (start && dayjs(start).isValid() && dayjs(start).isAfter(monthEnd, 'day')) return false
  if (end && dayjs(end).isValid() && dayjs(end).isBefore(monthStart, 'day')) return false
  return true
}

function normalizeDirectRows({ enrollments = [], students = [], courses = [], payments = [], selectedMonth }) {
  const monthStart = dayjs(`${selectedMonth}-01`)
  const monthEnd = monthStart.endOf('month')
  const studentsById = new Map(students.map((item) => [String(item.id), item]))
  const coursesById = new Map(courses.map((item) => [String(item.id), item]))
  const groups = new Map()

  enrollments
    .filter((row) => isEnrollmentActive(row, monthStart, monthEnd))
    .forEach((row) => {
      const studentId = String(row.tesseramento_id || row.allievo_id || row.student_id || '')
      const courseId = String(row.corso_id || row.course_id || '')
      if (!studentId) return
      const student = studentsById.get(studentId)
      if (!student) return
      const course = coursesById.get(courseId) || {}

      if (!groups.has(studentId)) {
        groups.set(studentId, {
          tesseramento_id: student.id,
          nome: student.nome || '',
          cognome: student.cognome || '',
          nome_completo: `${student.nome || ''} ${student.cognome || ''}`.trim() || 'Senza nome',
          email: student.email || '',
          cf: student.cf || student.codice_fiscale || '',
          telefono: student.telefono || student.cellulare || '',
          numero_tessera: student.numero_tessera || student.codice_tessera || '',
          mese: selectedMonth,
          copertura_dal: monthStart.format('YYYY-MM-DD'),
          copertura_al: monthEnd.format('YYYY-MM-DD'),
          quota_mese: 0,
          corsi: [],
        })
      }

      const target = groups.get(studentId)
      const tariffa = Number(row.quota_allievo_mensile ?? row.tariffa_mensile ?? course.prezzo_mensile ?? course.prezzo ?? 0)
      target.quota_mese += Number.isFinite(tariffa) ? tariffa : 0
      target.corsi.push({
        id: course.id || courseId,
        nome: course.nome || course.name || course.titolo || 'Corso',
        livello: course.livello || '',
        prezzo_mensile: tariffa,
        quota_insegnante_mensile: row.quota_insegnante_mensile ?? null,
        percentuale_insegnante: row.percentuale_insegnante ?? null,
        giorno_settimana: course.giorno_settimana || course.giorno || '',
        ora_inizio: course.ora_inizio || '',
        ora_fine: course.ora_fine || '',
      })
    })

  const paymentsByStudent = new Map()
  payments.forEach((payment) => {
    const studentId = String(payment.tesseramento_id || payment.allievo_id || payment.student_id || '')
    if (!studentId) return
    if (!paymentsByStudent.has(studentId)) paymentsByStudent.set(studentId, [])
    paymentsByStudent.get(studentId).push(payment)
  })

  return [...groups.values()].map((row) => {
    const relatedPayments = paymentsByStudent.get(String(row.tesseramento_id)) || []
    const total = Number(row.quota_mese || 0)
    const ledger = summarizeMonthlyTuitionPayments({ payments: relatedPayments, selectedMonth, totalDue: total })

    return normalizePaymentRow({
      ...row,
      quota_mese: total,
      pagato: ledger.paid,
      residuo: ledger.residue,
      stato_pagamento: ledger.status,
      pagamento_id: ledger.authoritative?.id || null,
      metodo_pagamento: ledger.method,
      nota_pagamento: ledger.note,
      data_pagamento: ledger.paidAt,
      payment_source: ledger.source,
      payment_records_count: ledger.relevantCount,
      payment_ignored_excess: ledger.ignoredExcess,
    })
  }).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto))
}

async function fetchAllieviPaymentsMonthDirect({ month, search = '', courseId = 'all', status = 'all' }) {
  const selectedMonth = month || dayjs().format('YYYY-MM')
  const [enrollmentsRes, studentsRes, coursesRes, paymentsRes] = await Promise.all([
    orchideaSupabase.from('iscrizioni_corsi').select('*').limit(10000),
    orchideaSupabase.from('tesseramenti').select('*').limit(10000),
    orchideaSupabase.from('corsi').select('*').limit(2000),
    orchideaSupabase.from('pagamenti').select('*').limit(10000),
  ])

  if (enrollmentsRes.error) throw new Error(enrollmentsRes.error.message || 'Errore caricamento iscrizioni corsi')
  if (studentsRes.error) throw new Error(studentsRes.error.message || 'Errore caricamento allievi')
  if (coursesRes.error) throw new Error(coursesRes.error.message || 'Errore caricamento corsi')

  let rows = normalizeDirectRows({
    enrollments: enrollmentsRes.data || [],
    students: studentsRes.data || [],
    courses: coursesRes.data || [],
    payments: paymentsRes.error ? [] : (paymentsRes.data || []),
    selectedMonth,
  })

  const term = search.trim().toLowerCase()
  if (term) {
    rows = rows.filter((row) => [row.nomeCompleto, row.email, row.cf, row.numero_tessera, row.telefono]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }

  if (courseId !== 'all') {
    rows = rows.filter((row) => row.corsi.some((course) => String(course.id) === String(courseId)))
  }

  if (status !== 'all') {
    rows = rows.filter((row) => row.stato_pagamento === status)
  }

  return rows
}

export async function fetchAllieviPaymentsMonth({ month, search = '', courseId = 'all', status = 'all' }) {
  const selectedMonth = month || dayjs().format('YYYY-MM')
  // Nova usa sempre il calcolo diretto dalle iscrizioni attive, così se togli/aggiungi corsi
  // o modifichi il pacchetto non restano quote vecchie salvate nei pagamenti.
  return fetchAllieviPaymentsMonthDirect({ month: selectedMonth, search, courseId, status })
}

async function setAllievoMonthlyPaymentDirect({ tesseramentoId, month, amount, status, note = '', method = 'Contanti' }) {
  const selectedMonth = month || dayjs().format('YYYY-MM')
  const monthStart = `${selectedMonth}-01`
  const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD')
  const cleanStatus = status || 'pagato'
  const normalizedAmount = Math.round(Math.max(0, Number(amount || 0)) * 100) / 100
  const importo = cleanStatus === 'pagato' ? normalizedAmount : 0
  const now = new Date().toISOString()

  const payload = {
    tesseramento_id: tesseramentoId,
    importo,
    periodo: selectedMonth,
    mese: monthStart,
    scadenza: monthEnd,
    stato: cleanStatus,
    metodo: method || null,
    descrizione: `Quota mensile ${selectedMonth}`,
    note: note || null,
    tipo: 'quota_mensile',
    pagato_il: cleanStatus === 'pagato' ? dayjs().format('YYYY-MM-DD') : null,
    data_pagamento: cleanStatus === 'pagato' ? dayjs().format('YYYY-MM-DD') : null,
    updated_at: now,
  }

  // Un solo record Nova autorevole per allievo e mese. I vecchi record per-corso
  // restano nello storico ma non vengono più sommati al saldo mensile.
  const existing = await orchideaSupabase
    .from('pagamenti')
    .select('id, updated_at, created_at')
    .eq('tesseramento_id', tesseramentoId)
    .eq('periodo', selectedMonth)
    .eq('tipo', 'quota_mensile')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (!existing.error && existing.data?.[0]?.id) {
    const { data, error } = await orchideaSupabase
      .from('pagamenti')
      .update(payload)
      .eq('id', existing.data[0].id)
      .select()
      .single()
    if (error) throw new Error(error.message || 'Errore aggiornamento pagamento')
    return data
  }

  if (existing.error) {
    throw new Error(existing.error.message || 'Errore verifica pagamento mensile')
  }

  const { data, error } = await orchideaSupabase
    .from('pagamenti')
    .insert([{ ...payload, created_at: now }])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore creazione pagamento. Verifica la tabella pagamenti di Orchidea Allievi.')
  return data
}

export async function setAllievoMonthlyPayment({ tesseramentoId, month, amount, status, note = '', method = 'Contanti' }) {
  if (!tesseramentoId) throw new Error('Allievo non selezionato')
  const selectedMonth = month || dayjs().format('YYYY-MM')
  return setAllievoMonthlyPaymentDirect({ tesseramentoId, month: selectedMonth, amount, status, note, method })
}
