import { supabase } from './supabase'

function makeManualEntryKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `manual:${crypto.randomUUID()}`
  }

  return `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function prepareEntryForInsert(payload) {
  return {
    ...payload,
    source: payload?.source || 'Manuale',
    entry_key: payload?.entry_key || makeManualEntryKey(),
  }
}

function chunkArray(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export async function fetchEntries({
  search = '',
  fromDate = '',
  fromTime = '',
  toDate = '',
  toTime = '',
  onlyWithoutAccount = false,
  accountCode = '',
  ivaFilter = '',
  page = 1,
  pageSize = 1000,
}) {
  const fromIndex = (page - 1) * pageSize
  const toIndex = fromIndex + pageSize - 1

  let query = supabase
    .from('entries')
    .select('*', { count: 'exact' })
    .order('operation_datetime', { ascending: false, nullsFirst: false })
    .order('id_key', { ascending: false })
    .range(fromIndex, toIndex)

  if (fromDate) {
    const fromTs = `${fromDate}T${fromTime || '00:00'}:00`
    query = query.gte('operation_datetime', fromTs)
  }

  if (toDate) {
    const toTs = `${toDate}T${toTime || '23:59'}:59`
    query = query.lte('operation_datetime', toTs)
  }

  if (onlyWithoutAccount) {
    query = query.or('account_code.is.null,account_code.eq.')
  } else if (accountCode) {
    query = query.eq('account_code', accountCode)
  }

  if (ivaFilter === 'with_vat') {
    query = query.gt('vat_rate', 0)
  }

  if (ivaFilter === 'without_vat') {
    query = query.or('vat_rate.is.null,vat_rate.eq.0')
  }

  if (search.trim()) {
    const q = search.trim()
    query = query.or(`description.ilike.%${q}%,note.ilike.%${q}%,source.ilike.%${q}%`)
  }

  const { data, error, count } = await query

  if (error) throw new Error(error.message || 'Errore caricamento movimenti')

  return {
    rows: data || [],
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
  }
}

export async function fetchAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code', { ascending: true })

  if (error) throw new Error(error.message || 'Errore caricamento conti')
  return data || []
}

export async function createEntry(payload) {
  const preparedPayload = prepareEntryForInsert(payload)

  const { data, error } = await supabase
    .from('entries')
    .insert([preparedPayload])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore creazione movimento')
  return data
}

export async function updateEntry(id, payload) {
  const cleanPayload = { ...payload }
  delete cleanPayload.entry_key
  delete cleanPayload.id_key
  delete cleanPayload.import_group_key
  delete cleanPayload.import_occurrence
  delete cleanPayload.import_batch_id

  const { data, error } = await supabase
    .from('entries')
    .update(cleanPayload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore modifica movimento')
  return data
}

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Errore eliminazione movimento')
}

export async function createEntriesBatch(rows) {
  const preparedRows = (rows || []).map((row) => prepareEntryForInsert(row))

  const { data, error } = await supabase
    .from('entries')
    .insert(preparedRows)
    .select('id,id_key')

  if (error) throw new Error(error.message || 'Errore import batch movimenti')
  return data || []
}

export function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

export function normalizeNumberInput(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export async function fetchEntriesFilteredTotals(filters) {
  const { data, error } = await supabase.rpc('entries_filtered_totals', {
    p_search: filters.search || null,
    p_from_date: filters.fromDate || null,
    p_from_time: filters.fromTime || null,
    p_to_date: filters.toDate || null,
    p_to_time: filters.toTime || null,
    p_only_without_account: filters.onlyWithoutAccount || false,
    p_account_code: filters.accountCode || null,
    p_iva_filter: filters.ivaFilter || null,
  })

  if (error) throw new Error(error.message || 'Errore caricamento totali filtrati')
  return data?.[0] || { total_rows: 0, total_in: 0, total_out: 0, saldo: 0 }
}

export async function bulkUpdateEntries({
  ids = null,
  filters,
  updates,
}) {
  const { data, error } = await supabase.rpc('entries_bulk_update_filtered', {
    p_ids: ids,
    p_search: filters.search || null,
    p_from_date: filters.fromDate || null,
    p_from_time: filters.fromTime || null,
    p_to_date: filters.toDate || null,
    p_to_time: filters.toTime || null,
    p_only_without_account: filters.onlyWithoutAccount || false,
    p_account_code: filters.accountCode || null,
    p_iva_filter: filters.ivaFilter || null,

    p_set_account_code: updates.account_code ?? null,
    p_set_nature: updates.nature ?? null,
    p_set_method: updates.method ?? null,
    p_set_center: updates.center ?? null,
    p_set_vat_rate: updates.vat_rate ?? null,
    p_set_vat_amount: updates.vat_amount ?? null,
    p_set_vat_side: updates.vat_side ?? null,
    p_set_source: updates.source ?? null,
  })

  if (error) throw new Error(error.message || 'Errore modifica massiva movimenti')
  return data?.[0] || { updated_rows: 0 }
}

export async function importSumupEntries({ userId, fileName, rows }) {
  const safeRows = Array.isArray(rows) ? rows : []
  const chunks = chunkArray(safeRows, 500)

  let imported_rows = 0
  let skipped_rows = 0
  let last_import_batch_id = null

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]

    const { data, error } = await supabase.rpc('import_sumup_entries', {
      p_user_id: userId,
      p_file_name: i === 0 ? fileName : `${fileName} (parte ${i + 1})`,
      p_rows: chunk,
    })

    if (error) {
      throw new Error(
        error.message ||
          `Errore import SumUp nel blocco ${i + 1} di ${chunks.length}`
      )
    }

    const result = data?.[0] || {
      imported_rows: 0,
      skipped_rows: 0,
      import_batch_id: null,
    }

    imported_rows += Number(result.imported_rows || 0)
    skipped_rows += Number(result.skipped_rows || 0)
    last_import_batch_id = result.import_batch_id || last_import_batch_id
  }

  return {
    imported_rows,
    skipped_rows,
    import_batch_id: last_import_batch_id,
  }
}

export async function fetchLastSumupImport() {
  const { data, error } = await supabase
    .from('import_logs')
    .select('*')
    .eq('source', 'sumup')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message || 'Errore lettura ultimo import')
  return data || null
}