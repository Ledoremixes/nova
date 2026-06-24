import { supabase } from './supabase'
import { orchideaSupabase, getOrchideaConfigStatus, hasDedicatedOrchideaConfig, getOrchideaAuthStatus } from './orchideaSupabase'

const TESSERAMENTI_SELECT = `
  id,
  nome,
  cognome,
  nascita,
  luogo,
  cf,
  email,
  telefono,
  residenza,
  status,
  payment_status,
  valid_from,
  valid_until,
  qr_token,
  numero_tessera,
  tessera_attiva,
  is_corsista,
  stagione,
  auth_user_id,
  created_at,
  updated_at
`

function isMissingTableError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    text.includes('pgrst205') ||
    text.includes('could not find the table') ||
    text.includes('schema cache') ||
    text.includes('relation') && text.includes('does not exist')
  )
}

function isMissingColumnError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('column') && (text.includes('does not exist') || text.includes('schema cache'))
}

function isOrchideaAuthRequired(error) {
  return error?.code === 'ORCHIDEA_AUTH_REQUIRED'
}

function isPermissionError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    text.includes('permission denied') ||
    text.includes('not authorized') ||
    text.includes('jwt') ||
    text.includes('rls') ||
    text.includes('row-level security') ||
    text.includes('unauthorized')
  )
}

function withSource(rows, sourceTable, sourceLabel, configMode = 'nova') {
  const normalizedRows = (rows || []).map((row) => ({
    ...row,
    _sourceTable: sourceTable,
    _sourceLabel: sourceLabel,
    _configMode: configMode,
  }))

  Object.defineProperty(normalizedRows, 'sourceTable', { value: sourceTable, enumerable: false })
  Object.defineProperty(normalizedRows, 'sourceLabel', { value: sourceLabel, enumerable: false })
  Object.defineProperty(normalizedRows, 'configMode', { value: configMode, enumerable: false })
  return normalizedRows
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1' || value === 1) return true
  if (value === 'false' || value === '0' || value === 0) return false
  return fallback
}

function cleanText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function cleanStudentPayload(payload) {
  return {
    nome: cleanText(payload.nome),
    cognome: cleanText(payload.cognome),
    email: cleanText(payload.email)?.toLowerCase() || null,
    telefono: cleanText(payload.telefono),
    cf: cleanText(payload.cf)?.toUpperCase() || null,
    nascita: payload.nascita || null,
    luogo: cleanText(payload.luogo),
    residenza: cleanText(payload.residenza),
    numero_tessera: cleanText(payload.numero_tessera),
    stagione: cleanText(payload.stagione) || '2026/2027',
    status: cleanText(payload.status) || 'pending_payment',
    payment_status: cleanText(payload.payment_status) || 'unpaid',
    tessera_attiva: normalizeBoolean(payload.tessera_attiva, true),
    is_corsista: normalizeBoolean(payload.is_corsista, false),
    updated_at: new Date().toISOString(),
  }
}

function cleanLegacyPayload(payload) {
  const residenza = cleanText(payload.residenza) || ''
  return {
    nome: cleanText(payload.nome),
    cognome: cleanText(payload.cognome),
    email: cleanText(payload.email)?.toLowerCase() || null,
    cellulare: cleanText(payload.telefono),
    cod_fiscale: cleanText(payload.cf)?.toUpperCase() || null,
    indirizzo: residenza || null,
    tipo: normalizeBoolean(payload.is_corsista, false) ? 'Corsista' : 'Tesserato',
    anno: cleanText(payload.stagione) || '25/26',
    pagamento: cleanText(payload.payment_status) || cleanText(payload.status) || null,
    note: cleanText(payload.note),
  }
}

function normalizeLegacyTesserato(row) {
  const pagamento = row.pagamento || row.stato_pagamento || ''
  const paid = String(pagamento).toLowerCase().includes('pag')
  const tipo = row.tipo || 'Tesserato'

  return {
    id: row.id,
    nome: row.nome || '',
    cognome: row.cognome || '',
    nascita: row.nascita || row.data_nascita || null,
    luogo: row.luogo || row.luogo_nascita || '',
    cf: row.cf || row.cod_fiscale || '',
    email: row.email || '',
    telefono: row.telefono || row.cellulare || '',
    residenza: row.residenza || [row.indirizzo, row.citta].filter(Boolean).join(', '),
    status: row.status || (paid ? 'active' : 'pending_payment'),
    payment_status: row.payment_status || (paid ? 'paid' : 'unpaid'),
    valid_from: row.valid_from || null,
    valid_until: row.valid_until || null,
    qr_token: row.qr_token || row.codice_tessera || row.id,
    numero_tessera: row.numero_tessera || row.tessera_numero || row.codice_tessera || '',
    tessera_attiva: row.tessera_attiva ?? true,
    is_corsista: String(tipo).toLowerCase().includes('cors'),
    stagione: row.stagione || row.anno || '25/26',
    auth_user_id: row.auth_user_id || null,
    created_at: row.created_at || row.createdAt || null,
    updated_at: row.updated_at || row.updatedAt || null,
    note: row.note || '',
    _rawLegacy: row,
  }
}

function extractMembershipProgressive(value, prefix = 'ORC-') {
  if (!value || !String(value).startsWith(prefix)) return 0
  const found = String(value).match(/(\d+)$/)
  return found ? Number(found[1]) || 0 : 0
}

function makeNextMembershipNumber(students) {
  const prefix = 'ORC-'
  const max = (students || []).reduce((highest, student) => {
    const current = extractMembershipProgressive(student.numero_tessera, prefix)
    return current > highest ? current : highest
  }, 0)
  return `${prefix}${String(max + 1).padStart(6, '0')}`
}

async function fetchOrchideaTesseramenti() {
  const config = getOrchideaConfigStatus()

  if (hasDedicatedOrchideaConfig) {
    const authStatus = await getOrchideaAuthStatus()
    if (!authStatus.authenticated) {
      const authError = new Error(
        'Il database Orchidea Allievi è configurato, ma non hai una sessione attiva su orchidea-allievi. Fai logout da Nova e accedi con la stessa email/password admin che usi nel portale allievi; se accedi con manuel@orchidea.it ma l’admin allievi è manuelmia01385@gmail.com, Supabase non può vedere i tesserati per via delle policy RLS.'
      )
      authError.code = 'ORCHIDEA_AUTH_REQUIRED'
      throw authError
    }
  }

  const { data, error } = await orchideaSupabase
    .from('tesseramenti')
    .select(TESSERAMENTI_SELECT)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    if (isMissingTableError(error) || isPermissionError(error)) {
      error._handledTesseramentiError = true
    }
    throw error
  }

  return withSource(data || [], 'tesseramenti', 'Orchidea Allievi', config.mode)
}

async function fetchLegacyTesserati({ search = '', anno = '', tipo = '' } = {}) {
  let query = supabase
    .from('tesserati')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (anno) query = query.eq('anno', anno)
  if (tipo) query = query.eq('tipo', tipo)

  if (search.trim()) {
    const q = search.trim()
    query = query.or(
      `nome.ilike.%${q}%,cognome.ilike.%${q}%,email.ilike.%${q}%,cod_fiscale.ilike.%${q}%,cellulare.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Errore caricamento tesserati Nova')

  return withSource((data || []).map(normalizeLegacyTesserato), 'tesserati', 'Nova legacy', 'nova')
}

export async function fetchTesserati(filters = {}) {
  try {
    return await fetchOrchideaTesseramenti()
  } catch (error) {
    if (isOrchideaAuthRequired(error)) {
      throw error
    }

    if (hasDedicatedOrchideaConfig && isPermissionError(error)) {
      throw new Error(
        'Accesso negato al database Orchidea Allievi. Verifica che l’account con cui accedi a Nova esista anche nel portale allievi come admin attivo, oppure accedi con la stessa email/password admin usata su orchidea-allievi.'
      )
    }

    if (!isMissingTableError(error) && !error?._handledTesseramentiError) {
      console.warn('Errore lettura tesseramenti Orchidea:', error)
    }

    return fetchLegacyTesserati(filters)
  }
}

export async function fetchTesseratoDetails(id) {
  if (!id) return { enrollments: [], payments: [] }

  try {
    const [enrollmentsResult, paymentsResult] = await Promise.all([
      orchideaSupabase
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
          genera_pagamento,
          pacchetto_id,
          pacchetto_nome,
          pacchetto_totale_mensile,
          quota_pacchetto_percentuale,
          created_at,
          corsi(id, nome, livello, giorno_settimana, ora_inizio, ora_fine, prezzo_mensile)
        `)
        .eq('tesseramento_id', id)
        .order('created_at', { ascending: false }),
      orchideaSupabase
        .from('pagamenti')
        .select('id, tesseramento_id, descrizione, importo, periodo, scadenza, stato, metodo, pagato_il, created_at')
        .eq('tesseramento_id', id)
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    const firstError = enrollmentsResult.error || paymentsResult.error
    if (firstError) throw firstError

    return {
      enrollments: enrollmentsResult.data || [],
      payments: paymentsResult.data || [],
    }
  } catch (error) {
    if (isMissingTableError(error) || isPermissionError(error)) {
      return { enrollments: [], payments: [] }
    }
    throw new Error(error.message || 'Errore caricamento scheda allievo')
  }
}

export async function updateTesserato(id, payload) {
  try {
    const { data, error } = await orchideaSupabase
      .from('tesseramenti')
      .update(cleanStudentPayload(payload))
      .eq('id', id)
      .select(TESSERAMENTI_SELECT)
      .single()

    if (error) throw error
    return { ...data, _sourceTable: 'tesseramenti', _sourceLabel: 'Orchidea Allievi' }
  } catch (error) {
    if (isOrchideaAuthRequired(error)) {
      throw error
    }

    if (hasDedicatedOrchideaConfig && isPermissionError(error)) {
      throw new Error('Non hai i permessi per modificare i tesserati sul database Orchidea Allievi.')
    }

    if (!isMissingTableError(error) && !isMissingColumnError(error) && !isPermissionError(error)) {
      throw new Error(error.message || 'Errore salvataggio scheda allievo')
    }

    const { data, error: legacyError } = await supabase
      .from('tesserati')
      .update(cleanLegacyPayload(payload))
      .eq('id', id)
      .select()
      .single()

    if (legacyError) throw new Error(legacyError.message || 'Errore modifica tesserato Nova')
    return { ...normalizeLegacyTesserato(data), _sourceTable: 'tesserati', _sourceLabel: 'Nova legacy' }
  }
}

export async function toggleCorsista(student) {
  if (student?._sourceTable === 'tesserati') {
    return updateTesserato(student.id, { ...student, is_corsista: !student.is_corsista })
  }

  const { data, error } = await orchideaSupabase
    .from('tesseramenti')
    .update({
      is_corsista: !student.is_corsista,
      updated_at: new Date().toISOString(),
    })
    .eq('id', student.id)
    .select(TESSERAMENTI_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Errore aggiornamento ruolo corsista')
  return { ...data, _sourceTable: 'tesseramenti', _sourceLabel: 'Orchidea Allievi' }
}

export async function generateMembershipNumber(student) {
  if (student?._sourceTable === 'tesserati') {
    throw new Error('La generazione del numero tessera ORC è disponibile solo sulla tabella tesseramenti del portale allievi.')
  }

  const students = await fetchTesserati()
  const nextNumber = makeNextMembershipNumber(students)

  const { data, error } = await orchideaSupabase
    .from('tesseramenti')
    .update({ numero_tessera: nextNumber, updated_at: new Date().toISOString() })
    .eq('id', student.id)
    .select(TESSERAMENTI_SELECT)
    .single()

  if (error) throw new Error(error.message || 'Errore generazione numero tessera')
  return { ...data, _sourceTable: 'tesseramenti', _sourceLabel: 'Orchidea Allievi' }
}

export async function generateMissingMembershipNumbers() {
  const students = await fetchTesserati()

  if (students.sourceTable === 'tesserati') {
    throw new Error('Configura il database Orchidea Allievi per generare i numeri tessera ufficiali.')
  }

  const missing = [...students]
    .filter((student) => !String(student.numero_tessera || '').trim())
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))

  let localStudents = [...students]
  let generated = 0

  for (const student of missing) {
    const nextNumber = makeNextMembershipNumber(localStudents)
    const { error } = await orchideaSupabase
      .from('tesseramenti')
      .update({ numero_tessera: nextNumber, updated_at: new Date().toISOString() })
      .eq('id', student.id)

    if (error) throw new Error(error.message || 'Errore generazione numeri tessera')

    localStudents = localStudents.map((item) =>
      item.id === student.id ? { ...item, numero_tessera: nextNumber } : item
    )
    generated += 1
  }

  return { generated }
}
