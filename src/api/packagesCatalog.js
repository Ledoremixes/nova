import { supabase } from './supabase'
import { COURSE_PRICE_LIST, enrichPackagePricingMetadata } from '../lib/coursePriceList'

const SECTION_KEY = 'pagamenti'
const LIST_KEY = 'pacchetti_corsi'
const DEFAULT_PACKAGES = COURSE_PRICE_LIST.map((item) => ({ ...item, attivo: true }))

function parseMetadata(value) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizePackage(row = {}) {
  const metadata = row._metadata || parseMetadata(row.value)
  const type = metadata.tipo || row.tipo || 'mensile'
  return enrichPackagePricingMetadata({
    id: row.id,
    nome: row.nome || row.label || 'Pacchetto',
    tipo: type,
    durata_mesi: type === 'gettone' ? 1 : Math.max(1, Number(metadata.durata_mesi ?? row.durata_mesi ?? 1)),
    prezzo: Math.max(0, Number(metadata.prezzo ?? row.prezzo ?? 0)),
    descrizione: metadata.descrizione ?? row.descrizione ?? '',
    pricing_key: metadata.pricing_key ?? row.pricing_key ?? null,
    pricing_group: metadata.pricing_group ?? row.pricing_group ?? null,
    pricing_period: metadata.pricing_period ?? row.pricing_period ?? null,
    attivo: row.attivo !== undefined ? row.attivo !== false : row.is_active !== false,
    ordine: Number(row.ordine ?? row.sort_order ?? 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  })
}

function metadataForPackage(payload) {
  const tipo = payload.tipo || 'mensile'
  return JSON.stringify({
    schema: 1,
    tipo,
    durata_mesi: tipo === 'gettone' ? 1 : Math.max(1, Number(payload.durata_mesi || 1)),
    prezzo: Math.max(0, Number(payload.prezzo || 0)),
    descrizione: String(payload.descrizione || '').trim(),
    pricing_key: payload.pricing_key || null,
    pricing_group: payload.pricing_group || null,
    pricing_period: payload.pricing_period || null,
  })
}

function validatePackage(payload) {
  const nome = String(payload.nome || '').trim()
  if (!nome) throw new Error('Inserisci il nome del pacchetto.')
  const prezzo = Number(payload.prezzo)
  if (!Number.isFinite(prezzo) || prezzo < 0) throw new Error('Inserisci un prezzo valido.')
  return nome
}

async function fetchRows({ includeInactive = true } = {}) {
  let query = supabase
    .from('lookup_options')
    .select('id,label,value,sort_order,is_active,created_at')
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Errore caricamento catalogo pacchetti')
  return data || []
}

async function ensureDefaultPackages() {
  const rows = await fetchRows({ includeInactive: true })
  const normalized = rows.map(normalizePackage)
  const existingKeys = new Set(normalized.map((item) => item.pricing_key).filter(Boolean))
  const existingNames = new Set(normalized.map((item) => String(item.nome || '').trim().toLowerCase()))
  const missing = DEFAULT_PACKAGES.filter((item) => {
    if (existingKeys.has(item.pricing_key)) return false
    return !existingNames.has(String(item.nome || '').trim().toLowerCase())
  })

  if (!missing.length) return normalized

  const inserts = missing.map((item) => ({
    user_id: null,
    section_key: SECTION_KEY,
    list_key: LIST_KEY,
    label: item.nome,
    value: metadataForPackage(item),
    sort_order: item.ordine,
    is_active: true,
  }))

  const { error } = await supabase.from('lookup_options').insert(inserts)
  if (error) {
    const afterRace = (await fetchRows({ includeInactive: true })).map(normalizePackage)
    const afterKeys = new Set(afterRace.map((item) => item.pricing_key).filter(Boolean))
    const unresolved = missing.filter((item) => !afterKeys.has(item.pricing_key))
    if (unresolved.length) throw new Error(error.message || 'Errore creazione listino pacchetti predefinito')
    return afterRace
  }

  return (await fetchRows({ includeInactive: true })).map(normalizePackage)
}

export async function fetchPackagesCatalog({ includeInactive = true } = {}) {
  // Il pacchetto base deve esistere sempre, anche se il catalogo contiene già
  // altre formule create in precedenza. Lo creiamo solo se manca, senza
  // sovrascrivere eventuali modifiche successive fatte dalla segreteria.
  const rows = await ensureDefaultPackages()
  return rows.filter((item) => includeInactive || item.attivo)
}

export async function createPackageCatalog(payload) {
  const nome = validatePackage(payload)
  const { data, error } = await supabase
    .from('lookup_options')
    .insert([{
      user_id: null,
      section_key: SECTION_KEY,
      list_key: LIST_KEY,
      label: nome,
      value: metadataForPackage(payload),
      sort_order: Number(payload.ordine || 0),
      is_active: payload.attivo !== false,
    }])
    .select('id,label,value,sort_order,is_active,created_at')
    .single()

  if (error) throw new Error(error.message || 'Errore creazione pacchetto')
  return normalizePackage(data)
}

export async function updatePackageCatalog(id, payload) {
  if (!id) throw new Error('Pacchetto non indicato.')
  const nome = validatePackage(payload)
  const { data, error } = await supabase
    .from('lookup_options')
    .update({
      label: nome,
      value: metadataForPackage(payload),
      sort_order: Number(payload.ordine || 0),
      is_active: payload.attivo !== false,
    })
    .eq('id', id)
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .select('id,label,value,sort_order,is_active,created_at')
    .single()

  if (error) throw new Error(error.message || 'Errore modifica pacchetto')
  return normalizePackage(data)
}

export async function deletePackageCatalog(id) {
  if (!id) throw new Error('Pacchetto non indicato.')
  const { error } = await supabase
    .from('lookup_options')
    .delete()
    .eq('id', id)
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)

  if (error) throw new Error(error.message || 'Errore eliminazione pacchetto')
  return true
}
