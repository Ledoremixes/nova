import dayjs from 'dayjs'
import { supabase } from './supabase'
import { membershipCode } from '../lib/membership'
import { fetchOrchideaStudents, fetchOrchideaTeachers } from './orchideaEntities'

function normalizeNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function monthKey(value) {
  const date = value ? dayjs(value) : null
  return date?.isValid() ? date.format('YYYY-MM') : 'Senza data'
}

async function fetchEntriesForDashboard() {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, account_code, amount_in, amount_out, date, operation_datetime, description, note, source')
      .order('operation_datetime', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message || 'Errore caricamento movimenti dashboard')
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function fetchDashboardStats() {
  const rows = await fetchEntriesForDashboard()
  const byAccountMap = new Map()

  const totals = rows.reduce(
    (acc, row) => {
      const amountIn = normalizeNumber(row.amount_in)
      const amountOut = normalizeNumber(row.amount_out)
      acc.totalEntrate += amountIn
      acc.totalUscite += amountOut
      acc.totalMovements += 1

      const code = String(row.account_code || 'Senza conto').trim() || 'Senza conto'
      const current = byAccountMap.get(code) || { code, entrate: 0, uscite: 0, count: 0 }
      current.entrate += amountIn
      current.uscite += amountOut
      current.count += 1
      byAccountMap.set(code, current)

      return acc
    },
    { totalEntrate: 0, totalUscite: 0, totalMovements: 0 }
  )

  totals.saldo = totals.totalEntrate - totals.totalUscite

  return {
    ...totals,
    byAccount: [...byAccountMap.values()].sort((a, b) => (b.entrate + b.uscite) - (a.entrate + a.uscite)),
    barItemsTop: [],
  }
}

export async function fetchDashboardAndamentoMensile() {
  const rows = await fetchEntriesForDashboard()
  const map = new Map()

  rows.forEach((row) => {
    const key = monthKey(row.operation_datetime || row.date)
    const current = map.get(key) || { month: key, entrate: 0, uscite: 0 }
    current.entrate += normalizeNumber(row.amount_in)
    current.uscite += normalizeNumber(row.amount_out)
    map.set(key, current)
  })

  return [...map.values()].sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 12)
}

export async function fetchBarTopItems() {
  const rows = await fetchEntriesForDashboard()
  const barRows = rows.filter((row) => String(row.account_code || '').toUpperCase() === 'C')
  const map = new Map()

  barRows.forEach((row) => {
    const label = row.description || row.note || row.source || 'Voce bar'
    const current = map.get(label) || { label, amount: 0, count: 0 }
    current.amount += normalizeNumber(row.amount_in) + normalizeNumber(row.amount_out)
    current.count += 1
    map.set(label, current)
  })

  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 10)
}

export async function fetchDashboardRegistry() {
  const [students, teachers] = await Promise.all([
    fetchOrchideaStudents().catch((error) => {
      console.warn('Dashboard tesserati Orchidea non disponibili:', error)
      return []
    }),
    fetchOrchideaTeachers().catch((error) => {
      console.warn('Dashboard insegnanti non disponibili:', error)
      return []
    }),
  ])

  const sortedStudents = [...students]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 8)

  return {
    totalTesserati: students.length,
    totalInsegnanti: teachers.length,
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
