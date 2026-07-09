import { membershipCode } from '../lib/membership'
import { fetchOrchideaCourses, fetchOrchideaStudents, fetchOrchideaTeachers } from './orchideaEntities'

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

function lastMonths(count = 6) {
  const now = new Date()
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return { key, label: monthLabel(key), count: 0 }
  })
}

function statusKey(row) {
  if (row.is_corsista) return 'Corsisti'
  if (row.tessera_attiva === false) return 'Tessere non attive'
  if (['pending_payment', 'pending', 'unpaid'].includes(String(row.status || row.payment_status || '').toLowerCase())) return 'In attesa pagamento'
  return 'Tesserati attivi'
}

function sortByDateDesc(a, b) {
  return (safeDate(b.created_at)?.getTime() || 0) - (safeDate(a.created_at)?.getTime() || 0)
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

  const statusMap = new Map()
  students.forEach((row) => {
    const key = statusKey(row)
    statusMap.set(key, (statusMap.get(key) || 0) + 1)
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

  const sortedStudents = [...students].sort(sortByDateDesc).slice(0, 8)

  return {
    totalTesserati: students.length,
    totalTessereAttive: activeStudents.length,
    totalCorsisti: corsisti.length,
    totalInsegnanti: teachers.length,
    totalCorsi: courses.length,
    totalInAttesaPagamento: pendingPayment.length,
    registrationsByMonth: [...monthsMap.values()],
    statusDistribution: [...statusMap.entries()].map(([label, value]) => ({ label, value })),
    topCourses,
    ultimiTesserati: sortedStudents.map((row) => ({
      id: row.id,
      nomeCompleto: row.nomeCompleto || `${row.nome || ''} ${row.cognome || ''}`.trim(),
      tipo: row.is_corsista ? 'Corsista' : (row.tessera_attiva === false ? 'Non attiva' : 'Tesserato'),
      anno: row.stagione || '-',
      numeroTessera: membershipCode(row),
      createdAt: row.created_at || null,
    })),
  }
}
