import { supabase } from './supabase'

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

export async function fetchDashboardRegistry(userId) {
  const [tesseratiCountRes, teachersCountRes, ultimiTesseratiRes] = await Promise.all([
    supabase
      .from('tesserati')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('teachers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('tesserati')
      .select('id, nome, cognome, tipo, anno, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const errors = [
    tesseratiCountRes.error,
    teachersCountRes.error,
    ultimiTesseratiRes.error,
  ].filter(Boolean)

  if (errors.length > 0) {
    throw new Error(errors[0].message || 'Errore caricamento dati anagrafici dashboard')
  }

  return {
    totalTesserati: tesseratiCountRes.count || 0,
    totalInsegnanti: teachersCountRes.count || 0,
    ultimiTesserati: (ultimiTesseratiRes.data || []).map((row) => ({
      id: row.id,
      nomeCompleto: `${row.nome || ''} ${row.cognome || ''}`.trim(),
      tipo: row.tipo || '-',
      anno: row.anno || '-',
      createdAt: row.created_at || null,
    })),
  }
}