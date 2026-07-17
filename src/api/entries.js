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

function cleanText(value) {
  return String(value ?? '').trim()
}

function entryMutationError(error, fallback) {
  const message = String(error?.message || '')

  if (message.includes('FINANCIAL_YEAR_CLOSED')) {
    return new Error('L’esercizio finanziario relativo a questo movimento è chiuso. Riaprilo dalla sezione Contabilità prima di modificarlo.')
  }

  return new Error(message || fallback)
}

function applyEntryFilters(query, filters = {}) {
  const {
    search = '',
    fromDate = '',
    fromTime = '',
    toDate = '',
    toTime = '',
    onlyWithoutAccount = false,
    onlyWithoutNature = false,
    accountCode = '',
    ivaFilter = '',
    method = '',
    nature = '',
  } = filters

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

  if (onlyWithoutNature) {
  query = query.or('nature.is.null,nature.eq.')
} else {
  const natureValue = cleanText(nature)

  if (natureValue) {
    query = query.ilike('nature', natureValue)
  }
}

  if (ivaFilter === 'with_vat') {
    query = query.gt('vat_rate', 0)
  }

  if (ivaFilter === 'without_vat') {
    query = query.or('vat_rate.is.null,vat_rate.eq.0')
  }

  const methodValue = cleanText(method)

  if (methodValue) {
    query = query.ilike('method', `%${methodValue}%`)
  }

  const searchValue = cleanText(search)

  if (searchValue) {
    // La ricerca della pagina Prima nota è "Cerca per descrizione",
    // quindi filtro solo la descrizione.
    // Prima cercava anche in source/note e scrivendo "Sumup"
    // poteva mostrare tutte le voci importate da SumUp.
    query = query.ilike('description', `%${searchValue}%`)
  }

  return query
}

async function fetchAllFilteredRows(filters, selectColumns) {
  const pageSize = 1000
  let fromIndex = 0
  const rows = []

  while (true) {
    let query = supabase.from('entries').select(selectColumns)

    query = applyEntryFilters(query, filters)

    const { data, error } = await query.range(
      fromIndex,
      fromIndex + pageSize - 1
    )

    if (error) {
      throw new Error(error.message || 'Errore caricamento movimenti filtrati')
    }

    const chunk = data || []
    rows.push(...chunk)

    if (chunk.length < pageSize) break

    fromIndex += pageSize
  }

  return rows
}

async function fetchFilteredEntryIds(filters) {
  const rows = await fetchAllFilteredRows(filters, 'id')
  return rows.map((row) => row.id).filter(Boolean)
}

export async function fetchEntries({
  search = '',
  fromDate = '',
  fromTime = '',
  toDate = '',
  toTime = '',
  onlyWithoutAccount = false,
  onlyWithoutNature = false,
  accountCode = '',
  ivaFilter = '',
  method = '',
  nature = '',
  page = 1,
  pageSize = 1000,
}) {
  const fromIndex = (page - 1) * pageSize
  const toIndex = fromIndex + pageSize - 1

  let query = supabase
    .from('entries')
    .select('*', { count: 'exact' })

  query = applyEntryFilters(query, {
    search,
    fromDate,
    fromTime,
    toDate,
    toTime,
    onlyWithoutAccount,
    onlyWithoutNature,
    accountCode,
    ivaFilter,
    method,
    nature,
  })

  const { data, error, count } = await query
    .order('operation_datetime', { ascending: false, nullsFirst: false })
    .order('id_key', { ascending: false })
    .range(fromIndex, toIndex)

  if (error) {
    throw new Error(error.message || 'Errore caricamento movimenti')
  }

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
    .from('lookup_options')
    .select('id, label, value, sort_order, is_active, section_key, list_key')
    .eq('section_key', 'contabilita')
    .eq('list_key', 'conti_rendiconto')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Errore caricamento conti')
  }

  return (data || []).map((item) => ({
    id: item.id,
    code: item.value || '',
    name: item.label || '',
    sort_order: item.sort_order ?? 0,
    is_active: item.is_active ?? true,
    section_key: item.section_key,
    list_key: item.list_key,
  }))
}

export async function createEntry(payload) {
  const preparedPayload = prepareEntryForInsert(payload)

  const { data, error } = await supabase
    .from('entries')
    .insert([preparedPayload])
    .select()
    .single()

  if (error) {
    throw entryMutationError(error, 'Errore creazione movimento')
  }

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

  if (error) {
    throw entryMutationError(error, 'Errore modifica movimento')
  }

  return data
}

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', id)

  if (error) {
    throw entryMutationError(error, 'Errore eliminazione movimento')
  }
}

export async function createEntriesBatch(rows) {
  const preparedRows = (rows || []).map((row) => prepareEntryForInsert(row))

  const { data, error } = await supabase
    .from('entries')
    .insert(preparedRows)
    .select('id,id_key')

  if (error) {
    throw entryMutationError(error, 'Errore import batch movimenti')
  }

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
  const rows = await fetchAllFilteredRows(filters, 'amount_in,amount_out')

  const totals = rows.reduce(
    (acc, row) => {
      const amountIn = Number(row.amount_in || 0)
      const amountOut = Number(row.amount_out || 0)

      acc.total_rows += 1
      acc.total_in += Number.isFinite(amountIn) ? amountIn : 0
      acc.total_out += Number.isFinite(amountOut) ? amountOut : 0

      return acc
    },
    {
      total_rows: 0,
      total_in: 0,
      total_out: 0,
      saldo: 0,
    }
  )

  totals.saldo = totals.total_in - totals.total_out

  return totals
}

export async function bulkUpdateEntries({
  ids = null,
  filters,
  updates,
}) {
  const targetIds = Array.isArray(ids)
    ? ids
    : await fetchFilteredEntryIds(filters)

  if (!targetIds.length) {
    return { updated_rows: 0 }
  }

  const chunks = chunkArray(targetIds, 500)
  let updatedRows = 0

  for (const chunk of chunks) {
    const { data, error } = await supabase.rpc('entries_bulk_update_filtered', {
      // Passiamo sempre gli ID esatti da aggiornare.
      // Così la modifica massiva rispetta anche Metodo e ricerca descrizione,
      // senza dover modificare la funzione SQL su Supabase.
      p_ids: chunk,

      // Filtri neutralizzati: gli ID sono già stati calcolati sopra.
      p_search: null,
      p_from_date: null,
      p_from_time: null,
      p_to_date: null,
      p_to_time: null,
      p_only_without_account: false,
      p_only_without_nature: false,
      p_account_code: null,
      p_iva_filter: null,

      p_set_date: updates.date ?? null,
      p_set_operation_datetime: updates.operation_datetime ?? null,
      p_set_description: updates.description ?? null,
      p_set_amount_in: updates.amount_in ?? null,
      p_set_amount_out: updates.amount_out ?? null,
      p_set_account_code: updates.account_code ?? null,
      p_set_nature: updates.nature ?? null,
      p_set_method: updates.method ?? null,
      p_set_center: updates.center ?? null,
      p_set_note: updates.note ?? null,
      p_set_vat_rate: updates.vat_rate ?? null,
      p_set_vat_amount: updates.vat_amount ?? null,
      p_set_vat_side: updates.vat_side ?? null,
      p_set_source: updates.source ?? null,
    })

    if (error) {
      throw entryMutationError(error, 'Errore modifica massiva movimenti')
    }

    updatedRows += Number(data?.[0]?.updated_rows || 0)
  }

  return { updated_rows: updatedRows }
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
      throw entryMutationError(
        error,
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

  if (error) {
    throw new Error(error.message || 'Errore lettura ultimo import')
  }

  return data || null
}
