import dayjs from 'dayjs'
import { orchideaSupabase } from './orchideaSupabase'
import { summarizeMonthlyTuitionPayments } from '../lib/paymentLedger'
import { enrollmentIsActiveForMonth, resolveEnrollmentPricing } from '../lib/packagePricing'
import { fetchPackagesCatalog } from './packagesCatalog'
import { resolveCoursePricing } from '../lib/coursePriceList'

export function euro(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

function uuidOrNull(value) {
  const raw = String(value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null
}

function createPaymentGroupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Ultimo fallback: produce comunque una stringa UUID valida per PostgreSQL.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : ((value & 0x3) | 0x8)).toString(16)
  })
}

function stripNovaMetadata(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !key.startsWith('nova_')))
}

function isNovaMetadataSchemaError(error) {
  const message = String(error?.message || error?.details || '')
  return /nova_(package|payment|coverage|cash)/i.test(message)
}

async function paymentWriteWithLegacyFallback(write, payload) {
  let result = await write(payload)
  if (result?.error && isNovaMetadataSchemaError(result.error)) {
    result = await write(stripNovaMetadata(payload))
  }
  return result
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
    formula: row.nova_package_type === 'gettone' ? 'A gettone' : (row.nova_package_type || row.formula || (courses.length > 1 ? 'Multicorso' : 'Mensile')),
    tipo_pacchetto: row.nova_package_name || row.tipo_pacchetto || (courses.length > 1 ? 'Pacchetto multicorso' : 'Corso singolo'),
    copertura_dal: row.nova_coverage_from || row.copertura_dal || dayjs(`${row.mese || dayjs().format('YYYY-MM')}-01`).format('YYYY-MM-DD'),
    copertura_al: row.nova_coverage_to || row.copertura_al || dayjs(`${row.mese || dayjs().format('YYYY-MM')}-01`).endOf('month').format('YYYY-MM-DD'),
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
    package_coverage_complete: row.package_coverage_complete === true,
    nova_package_id: row.nova_package_id || null,
    nova_package_name: row.nova_package_name || '',
    nova_package_type: row.nova_package_type || '',
    nova_package_total: Number(row.nova_package_total || 0),
    nova_package_duration_months: Number(row.nova_package_duration_months || 0),
    nova_payment_group_id: row.nova_payment_group_id || null,
    nova_cash_amount: Number(row.nova_cash_amount || 0),
    token_payments_count: Number(row.token_payments_count || 0),
    token_paid: Number(row.token_paid || 0),
    recommended_package_id: row.recommended_package_id || null,
    recommended_package_name: row.recommended_package_name || '',
    pricing_group: row.pricing_group || null,
    pricing_group_label: row.pricing_group_label || '',
    corsi: courses,
  }
}

function normalizeDirectRows({ enrollments = [], students = [], courses = [], payments = [], pricingHistory = [], packages = [], selectedMonth }) {
  const monthStart = dayjs(`${selectedMonth}-01`)
  const monthEnd = monthStart.endOf('month')
  const studentsById = new Map(students.map((item) => [String(item.id), item]))
  const coursesById = new Map(courses.map((item) => [String(item.id), item]))
  const groups = new Map()

  enrollments
    .filter((row) => enrollmentIsActiveForMonth(row, selectedMonth))
    .forEach((row) => {
      const studentId = String(row.tesseramento_id || row.allievo_id || row.student_id || '')
      const courseId = String(row.corso_id || row.course_id || '')
      if (!studentId) return
      const student = studentsById.get(studentId)
      if (!student) return
      const course = coursesById.get(courseId) || {}
      const pricedRow = resolveEnrollmentPricing(row, pricingHistory, selectedMonth, course)

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
      const tariffa = Number(pricedRow.quota_allievo_mensile ?? pricedRow.tariffa_mensile ?? course.prezzo_mensile ?? course.prezzo ?? 0)
      target.quota_mese += Number.isFinite(tariffa) ? tariffa : 0
      target.corsi.push({
        id: course.id || courseId,
        nome: course.nome || course.name || course.titolo || 'Corso',
        disciplina: course.disciplina || course.tipo || '',
        livello: course.livello || '',
        prezzo_mensile: tariffa,
        quota_insegnante_mensile: pricedRow.quota_insegnante_mensile ?? null,
        percentuale_insegnante: pricedRow.percentuale_insegnante ?? null,
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
    const automaticPricing = resolveCoursePricing(row.corsi, packages, 'mensile')
    const total = Number(automaticPricing?.prezzo ?? row.quota_mese ?? 0)
    const ledger = summarizeMonthlyTuitionPayments({ payments: relatedPayments, selectedMonth, totalDue: total })

    return normalizePaymentRow({
      ...row,
      formula: automaticPricing ? 'Mensile' : row.formula,
      tipo_pacchetto: automaticPricing?.pricing_group_label || row.tipo_pacchetto,
      recommended_package_id: automaticPricing?.id || null,
      recommended_package_name: automaticPricing?.nome || '',
      pricing_group: automaticPricing?.pricing_group || null,
      pricing_group_label: automaticPricing?.pricing_group_label || '',
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
      package_coverage_complete: ledger.packageCoverageComplete,
      nova_package_id: ledger.packageId,
      nova_package_name: ledger.packageName,
      nova_package_type: ledger.packageType,
      nova_package_total: ledger.packageTotal,
      nova_package_duration_months: ledger.packageDurationMonths,
      nova_payment_group_id: ledger.paymentGroupId,
      nova_cash_amount: ledger.cashAmount,
      nova_coverage_from: ledger.coverageFrom,
      nova_coverage_to: ledger.coverageTo,
      token_payments_count: ledger.tokenPaymentsCount,
      token_paid: ledger.tokenPaid,
    })
  }).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto))
}

async function fetchAllieviPaymentsMonthDirect({ month, search = '', courseId = 'all', status = 'all' }) {
  const selectedMonth = month || dayjs().format('YYYY-MM')
  const [enrollmentsRes, studentsRes, coursesRes, paymentsRes, pricingHistoryRes, packages] = await Promise.all([
    orchideaSupabase.from('iscrizioni_corsi').select('*').limit(10000),
    orchideaSupabase.from('tesseramenti').select('*').limit(10000),
    orchideaSupabase.from('corsi').select('*').limit(2000),
    orchideaSupabase.from('pagamenti').select('*').limit(10000),
    orchideaSupabase.from('nova_package_pricing_history').select('*').limit(20000),
    fetchPackagesCatalog({ includeInactive: false }).catch(() => []),
  ])

  if (enrollmentsRes.error) throw new Error(enrollmentsRes.error.message || 'Errore caricamento iscrizioni corsi')
  if (studentsRes.error) throw new Error(studentsRes.error.message || 'Errore caricamento allievi')
  if (coursesRes.error) throw new Error(coursesRes.error.message || 'Errore caricamento corsi')

  let rows = normalizeDirectRows({
    enrollments: enrollmentsRes.data || [],
    students: studentsRes.data || [],
    courses: coursesRes.data || [],
    payments: paymentsRes.error ? [] : (paymentsRes.data || []),
    pricingHistory: pricingHistoryRes.error ? [] : (pricingHistoryRes.data || []),
    packages,
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
    nova_package_id: null,
    nova_package_name: null,
    nova_package_type: null,
    nova_package_total: null,
    nova_package_duration_months: null,
    nova_payment_group_id: null,
    nova_coverage_from: null,
    nova_coverage_to: null,
    nova_coverage_complete: false,
    nova_cash_amount: cleanStatus === 'pagato' ? normalizedAmount : 0,
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
    const { data, error } = await paymentWriteWithLegacyFallback(
      (writePayload) => orchideaSupabase
        .from('pagamenti')
        .update(writePayload)
        .eq('id', existing.data[0].id)
        .select()
        .single(),
      payload,
    )
    if (error) throw new Error(error.message || 'Errore aggiornamento pagamento')
    return data
  }

  if (existing.error) {
    throw new Error(existing.error.message || 'Errore verifica pagamento mensile')
  }

  const payloadWithCreatedAt = { ...payload, created_at: now }
  const { data, error } = await paymentWriteWithLegacyFallback(
    (writePayload) => orchideaSupabase.from('pagamenti').insert([writePayload]).select().single(),
    payloadWithCreatedAt,
  )

  if (error) throw new Error(error.message || 'Errore creazione pagamento. Verifica la tabella pagamenti di Orchidea Allievi.')
  return data
}


function moneyRound(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

async function fetchStudentMonthlyDue(tesseramentoId, selectedMonth) {
  const [enrollmentsRes, coursesRes, pricingHistoryRes, packages] = await Promise.all([
    orchideaSupabase.from('iscrizioni_corsi').select('*').eq('tesseramento_id', tesseramentoId).limit(1000),
    orchideaSupabase.from('corsi').select('*').limit(2000),
    orchideaSupabase.from('nova_package_pricing_history').select('*').eq('tesseramento_id', tesseramentoId).limit(5000),
    fetchPackagesCatalog({ includeInactive: false }).catch(() => []),
  ])
  if (enrollmentsRes.error) throw new Error(enrollmentsRes.error.message || 'Errore lettura corsi del corsista')
  if (coursesRes.error) throw new Error(coursesRes.error.message || 'Errore lettura corsi')
  const coursesById = new Map((coursesRes.data || []).map((item) => [String(item.id), item]))
  const history = pricingHistoryRes.error ? [] : (pricingHistoryRes.data || [])
  const activeEnrollments = (enrollmentsRes.data || []).filter((row) => enrollmentIsActiveForMonth(row, selectedMonth))
  const activeCourses = activeEnrollments.map((row) => coursesById.get(String(row.corso_id || row.course_id || '')) || {}).filter(Boolean)
  const automaticPricing = resolveCoursePricing(activeCourses, packages, 'mensile')
  if (automaticPricing) return moneyRound(automaticPricing.prezzo)

  return moneyRound(activeEnrollments.reduce((sum, row) => {
    const course = coursesById.get(String(row.corso_id || row.course_id || '')) || {}
    const priced = resolveEnrollmentPricing(row, history, selectedMonth, course)
    const amount = Number(priced.quota_allievo_mensile ?? priced.tariffa_mensile ?? course.prezzo_mensile ?? course.prezzo ?? 0)
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0)
  }, 0))
}

function allocatePackageAmount(totalAmount, dues) {
  const cleanTotal = moneyRound(Math.max(0, Number(totalAmount || 0)))
  const totalDue = dues.reduce((sum, item) => sum + Math.max(0, Number(item || 0)), 0)
  if (!dues.length) return []
  if (totalDue <= 0) {
    const base = moneyRound(cleanTotal / dues.length)
    const values = dues.map(() => base)
    values[values.length - 1] = moneyRound(cleanTotal - values.slice(0, -1).reduce((a, b) => a + b, 0))
    return values
  }
  const values = dues.map((due) => moneyRound(cleanTotal * Math.max(0, Number(due || 0)) / totalDue))
  values[values.length - 1] = moneyRound(cleanTotal - values.slice(0, -1).reduce((a, b) => a + b, 0))
  return values
}

export async function setAllievoPackagePayment({
  tesseramentoId,
  startMonth,
  packageItem,
  amount,
  method = 'Contanti',
  note = '',
}) {
  if (!tesseramentoId) throw new Error('Corsista non selezionato')
  if (!packageItem?.id && !packageItem?.special) throw new Error('Seleziona un pacchetto')
  const selectedStart = startMonth || dayjs().format('YYYY-MM')

  // Il gettone è una singola lezione: viene sempre INSERITO come movimento autonomo
  // e non aggiorna mai il record quota_mensile. In questo modo non può chiudere il mese.
  if (packageItem?.tipo === 'gettone') {
    const monthStart = `${selectedStart}-01`
    const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD')
    const now = new Date().toISOString()
    const cashAmount = moneyRound(amount)
    const groupId = createPaymentGroupId()
    const payload = {
      tesseramento_id: tesseramentoId,
      importo: cashAmount,
      periodo: selectedStart,
      mese: monthStart,
      scadenza: monthEnd,
      stato: 'pagato',
      metodo: method || null,
      descrizione: `${packageItem.nome || 'A gettone'} · lezione singola`,
      note: note || null,
      tipo: 'gettone_corso',
      pagato_il: dayjs().format('YYYY-MM-DD'),
      data_pagamento: dayjs().format('YYYY-MM-DD'),
      updated_at: now,
      created_at: now,
      nova_package_id: uuidOrNull(packageItem.id),
      nova_package_name: packageItem.nome || 'A gettone',
      nova_package_type: 'gettone',
      nova_package_total: cashAmount,
      nova_package_duration_months: 1,
      nova_payment_group_id: groupId,
      nova_coverage_from: null,
      nova_coverage_to: null,
      nova_coverage_complete: false,
      nova_cash_amount: cashAmount,
    }

    const { data, error } = await paymentWriteWithLegacyFallback(
      (writePayload) => orchideaSupabase.from('pagamenti').insert([writePayload]).select().single(),
      payload,
    )
    if (error) throw new Error(error.message || 'Errore registrazione gettone')
    return { kind: 'gettone', rows: [data], months: [selectedStart], groupId, coverageFrom: null, coverageTo: null, cashAmount }
  }
  const duration = Math.max(1, Number(packageItem.durata_mesi || 1))
  const months = Array.from({ length: duration }, (_, index) => dayjs(`${selectedStart}-01`).add(index, 'month').format('YYYY-MM'))
  const dues = []
  for (const itemMonth of months) dues.push(await fetchStudentMonthlyDue(tesseramentoId, itemMonth))
  const allocations = allocatePackageAmount(amount, dues)
  const groupId = createPaymentGroupId()
  const coverageFrom = `${months[0]}-01`
  const coverageTo = dayjs(`${months[months.length - 1]}-01`).endOf('month').format('YYYY-MM-DD')
  const now = new Date().toISOString()
  const cashAmount = moneyRound(amount)

  const saved = []
  for (let index = 0; index < months.length; index += 1) {
    const itemMonth = months[index]
    const monthStart = `${itemMonth}-01`
    const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD')
    const payload = {
      tesseramento_id: tesseramentoId,
      importo: allocations[index] || 0,
      periodo: itemMonth,
      mese: monthStart,
      scadenza: monthEnd,
      stato: 'pagato',
      metodo: method || null,
      descrizione: `${packageItem.nome} · copertura ${selectedStart} / ${months[months.length - 1]}`,
      note: note || null,
      tipo: 'quota_mensile',
      pagato_il: dayjs().format('YYYY-MM-DD'),
      data_pagamento: dayjs().format('YYYY-MM-DD'),
      updated_at: now,
      nova_package_id: uuidOrNull(packageItem.id),
      nova_package_name: packageItem.nome,
      nova_package_type: packageItem.tipo || 'altro',
      nova_package_total: cashAmount,
      nova_package_duration_months: duration,
      nova_payment_group_id: groupId,
      nova_coverage_from: coverageFrom,
      nova_coverage_to: coverageTo,
      nova_coverage_complete: true,
      nova_cash_amount: index === 0 ? cashAmount : 0,
    }

    const existing = await orchideaSupabase
      .from('pagamenti')
      .select('id')
      .eq('tesseramento_id', tesseramentoId)
      .eq('periodo', itemMonth)
      .eq('tipo', 'quota_mensile')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)

    if (existing.error) throw new Error(existing.error.message || `Errore verifica pagamento ${itemMonth}`)
    if (existing.data?.[0]?.id) {
      const { data, error } = await paymentWriteWithLegacyFallback(
        (writePayload) => orchideaSupabase.from('pagamenti').update(writePayload).eq('id', existing.data[0].id).select().single(),
        payload,
      )
      if (error) throw new Error(error.message || `Errore aggiornamento pagamento ${itemMonth}`)
      saved.push(data)
    } else {
      const payloadWithCreatedAt = { ...payload, created_at: now }
      const { data, error } = await paymentWriteWithLegacyFallback(
        (writePayload) => orchideaSupabase.from('pagamenti').insert([writePayload]).select().single(),
        payloadWithCreatedAt,
      )
      if (error) throw new Error(error.message || `Errore creazione pagamento ${itemMonth}`)
      saved.push(data)
    }
  }
  return { rows: saved, months, groupId, coverageFrom, coverageTo, cashAmount }
}

export async function setAllievoMonthlyPayment({ tesseramentoId, month, amount, status, note = '', method = 'Contanti' }) {
  if (!tesseramentoId) throw new Error('Allievo non selezionato')
  const selectedMonth = month || dayjs().format('YYYY-MM')
  return setAllievoMonthlyPaymentDirect({ tesseramentoId, month: selectedMonth, amount, status, note, method })
}
