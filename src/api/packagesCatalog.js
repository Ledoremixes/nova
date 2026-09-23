import { supabase } from './supabase'
import { COURSE_PRICE_LIST, enrichPackagePricingMetadata } from '../lib/coursePriceList'

const SECTION_KEY = 'pagamenti'
const LIST_KEY = 'pacchetti_corsi'
const DEFAULT_PACKAGES = COURSE_PRICE_LIST.map((item) => ({ ...item, attivo: true }))

const PACKAGES_CACHE_TTL = 10 * 60_000
let packagesCache = null
let packagesCacheExpiresAt = 0
let packagesInFlight = null

export function invalidatePackagesCatalogCache() {
  packagesCache = null
  packagesCacheExpiresAt = 0
  packagesInFlight = null
}

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
    pricing_key_explicit: Object.prototype.hasOwnProperty.call(metadata, 'pricing_key'),
    pricing_group: metadata.pricing_group ?? row.pricing_group ?? null,
    pricing_period: metadata.pricing_period ?? row.pricing_period ?? null,
    // Le formule del listino automatico non devono mai essere legate manualmente ai corsi:
    // vengono rilevate da Nova in base alla combinazione di corsi dell'allievo.
    course_ids: metadata.pricing_key
      ? []
      : (Array.isArray(metadata.course_ids) ? metadata.course_ids.map(String).filter(Boolean) : []),
    stackable: metadata.pricing_key ? false : metadata.stackable === true,
    covered_course_count: metadata.pricing_key
      ? null
      : (Number(metadata.covered_course_count || 0) > 0 ? Math.max(1, Math.floor(Number(metadata.covered_course_count))) : null),
    attivo: row.attivo !== undefined ? row.attivo !== false : row.is_active !== false,
    ordine: Number(row.ordine ?? row.sort_order ?? 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  })
}

function metadataForPackage(payload) {
  const tipo = payload.tipo || 'mensile'
  return JSON.stringify({
    schema: 3,
    tipo,
    durata_mesi: tipo === 'gettone' ? 1 : Math.max(1, Number(payload.durata_mesi || 1)),
    prezzo: Math.max(0, Number(payload.prezzo || 0)),
    descrizione: String(payload.descrizione || '').trim(),
    pricing_key: payload.pricing_key || null,
    pricing_group: payload.pricing_group || null,
    pricing_period: payload.pricing_period || null,
    course_ids: payload.pricing_key
      ? []
      : (Array.isArray(payload.course_ids) ? [...new Set(payload.course_ids.map(String).filter(Boolean))] : []),
    stackable: payload.pricing_key ? false : payload.stackable === true,
    covered_course_count: payload.pricing_key || payload.stackable !== true
      ? null
      : (Number(payload.covered_course_count || 0) > 0 ? Math.max(1, Math.floor(Number(payload.covered_course_count))) : null),
  })
}

function validatePackage(payload) {
  const nome = String(payload.nome || '').trim()
  if (!nome) throw new Error('Inserisci il nome del pacchetto.')
  const prezzo = Number(payload.prezzo)
  if (!Number.isFinite(prezzo) || prezzo < 0) throw new Error('Inserisci un prezzo valido.')
  if (!payload.pricing_key && payload.stackable === true && !(Array.isArray(payload.course_ids) && payload.course_ids.length)) {
    throw new Error('Una componente cumulabile deve avere almeno un corso associato.')
  }
  if (!payload.pricing_key && payload.stackable === true && Number(payload.covered_course_count || 0) > Number(payload.course_ids?.length || 0)) {
    throw new Error('Il numero di corsi coperti non può superare i corsi abilitati selezionati.')
  }
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

async function clearAutomaticPackageCourseAssignments(rows = []) {
  const repairs = rows.map((row) => {
    const metadata = parseMetadata(row.value)
    const normalized = normalizePackage({ ...row, _metadata: metadata })
    const currentCourseIds = Array.isArray(metadata.course_ids) ? metadata.course_ids.map(String).filter(Boolean) : []
    const automaticKey = normalized.pricing_key || null

    // Oltre a svuotare course_ids, autoripariamo i vecchi record standard che
    // erano stati salvati come pricing_key=null dopo una modifica manuale.
    if (!automaticKey) return null
    const needsRepair = metadata.pricing_key !== automaticKey
      || metadata.pricing_group !== normalized.pricing_group
      || metadata.pricing_period !== normalized.pricing_period
      || currentCourseIds.length > 0
    if (!needsRepair) return null

    return {
      row,
      metadata: {
        ...metadata,
        schema: 3,
        pricing_key: automaticKey,
        pricing_group: normalized.pricing_group || null,
        pricing_period: normalized.pricing_period || null,
        course_ids: [],
        stackable: false,
        covered_course_count: null,
      },
    }
  }).filter(Boolean)

  if (!repairs.length) return rows

  await Promise.all(repairs.map(async ({ row, metadata }) => {
    const { error } = await supabase
      .from('lookup_options')
      .update({ value: JSON.stringify(metadata) })
      .eq('id', row.id)
      .eq('section_key', SECTION_KEY)
      .eq('list_key', LIST_KEY)
    if (error) console.warn('Ripristino metadata pacchetto automatico non riuscito:', row.id, error.message)
  }))

  return fetchRows({ includeInactive: true })
}

async function ensureDefaultPackages() {
  let rows = await fetchRows({ includeInactive: true })
  rows = await clearAutomaticPackageCourseAssignments(rows)
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
  const now = Date.now()
  if (!packagesCache || now >= packagesCacheExpiresAt) {
    if (!packagesInFlight) {
      packagesInFlight = ensureDefaultPackages()
        .then((rows) => {
          packagesCache = rows
          packagesCacheExpiresAt = Date.now() + PACKAGES_CACHE_TTL
          return rows
        })
        .finally(() => { packagesInFlight = null })
    }
    await packagesInFlight
  }
  const rows = packagesCache || []
  return rows.filter((item) => includeInactive || item.attivo)
}

export async function createPackageCatalog(payload) {
  invalidatePackagesCatalogCache()
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
  invalidatePackagesCatalogCache()
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
  invalidatePackagesCatalogCache()
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
