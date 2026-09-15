import { fetchOrchideaCourses, fetchOrchideaStudents, fetchOrchideaTeachers } from './orchideaEntities'
import { fiscalCodeDetails } from '../lib/healthCard'

function safeDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function monthKey(value) {
  const date = safeDate(value)
  if (!date) return 'Senza data'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  if (!key || key === 'Senza data') return 'Senza data'
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, 1)
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric' }).format(date)
}


function normalizeGender(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['m', 'maschio', 'uomo', 'male'].includes(normalized)) return 'Uomini'
  if (['f', 'femmina', 'donna', 'female'].includes(normalized)) return 'Donne'
  return ''
}

function genderFromFiscalCode(value) {
  const cf = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!/^[A-Z0-9]{16}$/.test(cf)) return ''
  const day = Number(cf.slice(9, 11))
  if (!Number.isFinite(day) || day < 1 || day > 71) return ''
  return day > 40 ? 'Donne' : 'Uomini'
}

function resolveGender(row = {}) {
  return normalizeGender(row.sesso || row.raw?.sesso || row.raw?.genere) || genderFromFiscalCode(row.cf || row.raw?.cf || row.raw?.cod_fiscale)
}

function ageFromBirthDate(value, { maxAge = 120 } = {}) {
  const birth = safeDate(value)
  if (!birth) return null
  const today = new Date()
  if (birth > today) return null

  let age = today.getFullYear() - birth.getFullYear()
  const monthDelta = today.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 && age <= maxAge ? age : null
}

function fiscalCodeBirthDate(value) {
  const details = fiscalCodeDetails(value)
  if (!details?.valid || !details.birthDate) return null

  // Il CF contiene solo le ultime due cifre dell'anno. Valutiamo entrambi
  // i secoli possibili e scegliamo una data non futura e anagraficamente
  // plausibile. A parita' preferiamo il 2000, molto piu' probabile per
  // un iscritto rispetto a una persona ultra-centenaria.
  const parsed = safeDate(details.birthDate)
  if (!parsed) return null

  const year2 = parsed.getFullYear() % 100
  const month = parsed.getMonth()
  const day = parsed.getDate()
  const candidates = [2000 + year2, 1900 + year2]
    .map((year) => ({ year, date: new Date(year, month, day, 12, 0, 0) }))
    .filter(({ year, date }) => (
      date.getFullYear() === year
      && date.getMonth() === month
      && date.getDate() === day
      && ageFromBirthDate(date, { maxAge: 100 }) !== null
    ))
    .map(({ date }) => date)

  return candidates[0] || null
}

function resolveAge(row = {}) {
  const explicitBirthDate = row.nascita || row.raw?.nascita || row.raw?.data_nascita
  const explicitAge = ageFromBirthDate(explicitBirthDate)
  if (explicitAge !== null) return { age: explicitAge, source: 'birthDate' }

  const fiscalCode = row.cf || row.raw?.cf || row.raw?.cod_fiscale || row.raw?.codice_fiscale
  const cfBirthDate = fiscalCodeBirthDate(fiscalCode)
  const cfAge = ageFromBirthDate(cfBirthDate, { maxAge: 100 })
  if (cfAge !== null) return { age: cfAge, source: 'fiscalCode' }

  return { age: null, source: '' }
}

function ageBand(age) {
  if (age === null) return null
  if (age < 18) return '0–17'
  if (age <= 25) return '18–25'
  if (age <= 35) return '26–35'
  if (age <= 45) return '36–45'
  if (age <= 60) return '46–60'
  return '61+'
}

function lastMonths(count = 6) {
  const now = new Date()
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { key, label: monthLabel(key), count: 0 }
  })
}


export async function fetchDashboardStats() {
  return { totalEntrate: 0, totalUscite: 0, saldo: 0, totalMovements: 0, byAccount: [], barItemsTop: [] }
}

export async function fetchDashboardAndamentoMensile() {
  return []
}

export async function fetchBarTopItems() {
  return []
}

export async function fetchDashboardRegistry() {
  const [students, teachers, courses] = await Promise.all([
    fetchOrchideaStudents().catch((error) => {
      console.warn('Dashboard tesserati Orchidea non disponibili:', error)
      return []
    }),
    fetchOrchideaTeachers().catch((error) => {
      console.warn('Dashboard insegnanti Orchidea non disponibili:', error)
      return []
    }),
    fetchOrchideaCourses().catch((error) => {
      console.warn('Dashboard corsi Orchidea non disponibili:', error)
      return []
    }),
  ])

  const activeStudents = students.filter((row) => row.tessera_attiva !== false)
  const corsisti = students.filter((row) => row.is_corsista === true)
  const pendingPayment = students.filter((row) => {
    const payment = String(row.payment_status || row.status || '').toLowerCase()
    return ['unpaid', 'pending', 'pending_payment', 'non_pagato', 'da_pagare'].includes(payment)
  })

  const months = lastMonths(6)
  const monthsMap = new Map(months.map((item) => [item.key, { ...item }]))
  students.forEach((row) => {
    const key = monthKey(row.created_at)
    if (monthsMap.has(key)) monthsMap.get(key).count += 1
  })

  const genderCounts = { Uomini: 0, Donne: 0, 'Non determinato': 0 }
  students.forEach((row) => {
    const gender = resolveGender(row)
    genderCounts[gender || 'Non determinato'] += 1
  })

  const genderDistribution = [
    { label: 'Uomini', value: genderCounts.Uomini },
    { label: 'Donne', value: genderCounts.Donne },
  ]
  const genderKnown = genderCounts.Uomini + genderCounts.Donne
  const genderUnknown = genderCounts['Non determinato']

  const ageBandOrder = ['0–17', '18–25', '26–35', '36–45', '46–60', '61+']
  const ageCounts = new Map(ageBandOrder.map((label) => [label, 0]))
  let ageKnown = 0
  let ageFromFiscalCode = 0
  let ageFromBirthDateCount = 0
  students.forEach((row) => {
    const resolved = resolveAge(row)
    const band = ageBand(resolved.age)
    if (!band) return
    ageKnown += 1
    if (resolved.source === 'fiscalCode') ageFromFiscalCode += 1
    if (resolved.source === 'birthDate') ageFromBirthDateCount += 1
    ageCounts.set(band, (ageCounts.get(band) || 0) + 1)
  })
  const ageDistribution = ageBandOrder.map((label) => {
    const count = ageCounts.get(label) || 0
    const percentage = ageKnown ? Math.round((count / ageKnown) * 100) : 0
    return {
      key: label,
      label,
      count,
      meta: ageKnown ? `${percentage}% delle anagrafiche con eta determinabile` : '',
    }
  })

  const topCourses = [...courses]
    .sort((a, b) => Number(b.participants_count || 0) - Number(a.participants_count || 0))
    .slice(0, 6)
    .map((course) => ({
      id: course.id,
      label: course.nome || 'Corso',
      value: Number(course.participants_count || course.iscrizioni_corsi?.length || 0),
      meta: [course.livello, course.giorno_settimana].filter(Boolean).join(' · '),
    }))

  return {
    totalTesserati: students.length,
    totalTessereAttive: activeStudents.length,
    totalCorsisti: corsisti.length,
    totalInsegnanti: teachers.length,
    totalCorsi: courses.length,
    totalInAttesaPagamento: pendingPayment.length,
    registrationsByMonth: [...monthsMap.values()],
    genderDistribution,
    genderKnown,
    genderUnknown,
    ageDistribution,
    ageKnown,
    ageFromFiscalCode,
    ageFromBirthDate: ageFromBirthDateCount,
    ageUnknown: Math.max(0, students.length - ageKnown),
    topCourses,
  }
}
