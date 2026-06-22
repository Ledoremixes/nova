import { supabase } from './supabase'
import { fetchTesserati } from './tesserati'
import { membershipCode } from '../lib/membership'

function normalizeNumber(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

export async function fetchDashboardStats(userId) {
  const { data, error } = await supabase.rpc('dashboard_stats', {
    p_user_id: null, // userId, // TODO: fixare funzione per filtrare per userId
    p_from: null,
    p_to: null,
  })

  if (error) {
    throw new Error(error.message || 'Errore caricamento statistiche dashboard')
  }

  return {
    totalEntrate: normalizeNumber(data?.totalEntrate),
    totalUscite: normalizeNumber(data?.totalUscite),
    saldo: normalizeNumber(data?.saldo),
    totalMovements: normalizeNumber(data?.totalMovements),
    byAccount: Array.isArray(data?.byAccount) ? data.byAccount : [],
    barItemsTop: Array.isArray(data?.barItemsTop) ? data.barItemsTop : [],
  }
}

export async function fetchDashboardAndamentoMensile(userId) {
  const { data, error } = await supabase.rpc('dashboard_andamento_mensile', {
    p_user_id: userId,
  })

  if (error) {
    throw new Error(error.message || 'Errore caricamento andamento mensile')
  }

  return (data || []).map((row) => ({
    month: row.month,
    entrate: normalizeNumber(row.entrate),
    uscite: normalizeNumber(row.uscite),
  }))
}

export async function fetchBarTopItems(userId) {
  const { data, error } = await supabase.rpc('bar_top_items', {
    p_user_id: userId,
    p_from: null,
    p_to: null,
    p_limit: 10,
    p_bar_account_codes: ['C'],
  })

  if (error) {
    throw new Error(error.message || 'Errore caricamento top articoli bar')
  }

  return (data || []).map((row) => ({
    label: row.label || '-',
    amount: normalizeNumber(row.amount),
    count: normalizeNumber(row.count),
  }))
}

export async function fetchDashboardRegistry() {
  const [studentsResult, teachersCountRes] = await Promise.allSettled([
    fetchTesserati(),
    supabase
      .from('teachers')
      .select('id', { count: 'exact', head: true }),
  ])

  if (studentsResult.status === 'rejected') {
    throw new Error(studentsResult.reason?.message || 'Errore caricamento dati tesserati')
  }

  const students = studentsResult.value || []
  const teachersCount = teachersCountRes.status === 'fulfilled' && !teachersCountRes.value.error
    ? teachersCountRes.value.count || 0
    : 0

  const recentStudents = [...students]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 8)

  return {
    totalTesserati: students.length,
    totalInsegnanti: teachersCount,
    ultimiTesserati: recentStudents.map((row) => ({
      id: row.id,
      nomeCompleto: `${row.nome || ''} ${row.cognome || ''}`.trim(),
      tipo: row.is_corsista ? 'Corsista' : (row.tessera_attiva === false ? 'Non attiva' : 'Tesserato'),
      anno: row.stagione || '-',
      numeroTessera: membershipCode(row),
      createdAt: row.created_at || null,
    })),
  }
}
