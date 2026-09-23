export const COURSE_PRICE_LIST_VERSION = '2026/2027'


export const GIFT_PACKAGE = {
  id: 'builtin:omaggio',
  pricing_key: 'gift',
  pricing_group: 'gift',
  period: 'omaggio',
  nome: 'Omaggio · 1 mese',
  tipo: 'omaggio',
  durata_mesi: 1,
  prezzo: 0,
  descrizione: 'Copertura gratuita di un mese corso. La tessera corsista resta sempre dovuta.',
  ordine: -10,
  attivo: true,
}

export const COURSE_PRICE_LIST = [
  {
    pricing_key: 'token',
    pricing_group: 'token',
    period: 'gettone',
    nome: 'A gettone',
    tipo: 'gettone',
    durata_mesi: 1,
    prezzo: 12,
    descrizione: 'Lezione singola. Non copre il mese e non chiude la quota mensile.',
    ordine: 0,
  },
  ...makeGroup('single', '1 corso', { mensile: 40, trimestrale: 110, annuale: 320 }, 10),
  ...makeGroup('country', 'Country', { mensile: 30, trimestrale: 80, annuale: 230 }, 20),
  ...makeGroup('bachata_salsa', '2 corsi Bachata + Salsa', { mensile: 50, trimestrale: 135, annuale: 399 }, 30),
  ...makeGroup('two_special', '2 corsi Special', { mensile: 60, trimestrale: 170, annuale: 499 }, 40),
  ...makeGroup('three', '3 corsi', { mensile: 85, trimestrale: 245, annuale: 729 }, 50),
  ...makeGroup('unlimited', 'All You Can Dance', { mensile: 119, trimestrale: 345, annuale: 999 }, 60),
]

function makeGroup(group, label, prices, baseOrder) {
  return [
    buildPackage(group, label, 'mensile', 1, prices.mensile, baseOrder),
    buildPackage(group, label, 'trimestrale', 3, prices.trimestrale, baseOrder + 1),
    buildPackage(group, label, 'annuale', 12, prices.annuale, baseOrder + 2),
  ]
}

function buildPackage(group, label, period, months, price, order) {
  const periodLabel = period === 'mensile' ? 'Mensile' : period === 'trimestrale' ? 'Trimestrale' : 'Annuale'
  return {
    pricing_key: `${group}.${period}`,
    pricing_group: group,
    period,
    nome: `${periodLabel} · ${label}`,
    tipo: period,
    durata_mesi: months,
    prezzo: price,
    descrizione: `Listino corsi ${COURSE_PRICE_LIST_VERSION} · ${label}.`,
    ordine: order,
  }
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function courseText(course = {}) {
  return normalize([
    course.nome,
    course.name,
    course.titolo,
    course.disciplina,
    course.tipo,
    course.livello,
  ].filter(Boolean).join(' '))
}

function courseLevel(course = {}) {
  const value = courseText(course)
  if (/\b(intermedio|intermediate|interm)\b/.test(value)) return 'intermedio'
  if (/\b(base|basic|principiant[ei]|primi passi|principiante)\b/.test(value)) return 'base'
  return ''
}

function isDiscipline(course, discipline) {
  return new RegExp(`\\b${discipline}\\b`).test(courseText(course))
}

export function pricingGroupForCourses(courses = []) {
  const rows = (Array.isArray(courses) ? courses : []).filter(Boolean)
  const count = rows.length
  if (count <= 0) return null

  if (count === 1) {
    return isDiscipline(rows[0], 'country') ? 'country' : 'single'
  }

  if (count === 2) {
    const bachata = rows.find((course) => isDiscipline(course, 'bachata'))
    const salsa = rows.find((course) => isDiscipline(course, 'salsa'))
    if (bachata && salsa) {
      const bachataLevel = courseLevel(bachata)
      const salsaLevel = courseLevel(salsa)
      if (bachataLevel && salsaLevel && bachataLevel === salsaLevel && ['base', 'intermedio'].includes(bachataLevel)) {
        return 'bachata_salsa'
      }
    }
    return 'two_special'
  }

  if (count === 3) return 'three'
  return 'unlimited'
}

export function pricingGroupLabel(group) {
  const labels = {
    single: '1 corso',
    country: 'Country',
    bachata_salsa: '2 corsi Bachata + Salsa',
    two_special: '2 corsi Special',
    three: '3 corsi',
    unlimited: 'All You Can Dance',
    token: 'A gettone',
  }
  return labels[group] || 'Pacchetto corsi'
}

function derivePricingKey(item = {}) {
  const name = normalize(item.nome || item.label)

  // I nomi ufficiali del listino sono riservati alle formule automatiche.
  // Questo permette a Nova di autoriparare vecchi record che, dopo una modifica
  // manuale, sono rimasti con pricing_key=null ma conservano il nome standard.
  const exactStandard = COURSE_PRICE_LIST.find((row) => normalize(row.nome) === name)
  if (exactStandard?.pricing_key) return exactStandard.pricing_key

  if (item.pricing_key_explicit) return item.pricing_key ? String(item.pricing_key) : null
  if (item.pricing_key) return String(item.pricing_key)
  const type = String(item.tipo || '').toLowerCase()

  if (type === 'gettone' || name.includes('a gettone')) return 'token'

  const period = type === 'trimestrale' || name.includes('trimestrale')
    ? 'trimestrale'
    : type === 'annuale' || name.includes('annuale')
      ? 'annuale'
      : 'mensile'

  let group = null
  if (name.includes('all you can dance')) group = 'unlimited'
  else if (name.includes('bachata') && name.includes('salsa')) group = 'bachata_salsa'
  else if (name.includes('special') && name.includes('2 cors')) group = 'two_special'
  else if (name.includes('3 cors')) group = 'three'
  else if (name.includes('country')) group = 'country'
  else if (name.includes('1 cors')) group = 'single'

  return group ? `${group}.${period}` : null
}

export function enrichPackagePricingMetadata(item = {}) {
  const pricingKey = derivePricingKey(item)
  const [pricingGroup, periodFromKey] = pricingKey && pricingKey !== 'token' ? pricingKey.split('.') : [pricingKey, null]
  return {
    ...item,
    pricing_key: pricingKey,
    pricing_group: item.pricing_group || pricingGroup || null,
    pricing_period: item.pricing_period || periodFromKey || (pricingKey === 'token' ? 'gettone' : null),
    // Solo i pacchetti personalizzati possono essere associati manualmente ai corsi.
    // Il listino standard deve continuare a funzionare tramite rilevamento automatico.
    course_ids: pricingKey
      ? []
      : (Array.isArray(item.course_ids) ? [...new Set(item.course_ids.map(String).filter(Boolean))] : []),
    // I pacchetti personalizzati possono essere usati come componenti cumulative:
    // es. Country 1 corso e mezzo (45 €) + Kizomba base (40 €).
    stackable: pricingKey ? false : item.stackable === true,
    covered_course_count: pricingKey || item.stackable !== true
      ? null
      : stackableCoveredCount({
          ...item,
          course_ids: Array.isArray(item.course_ids) ? [...new Set(item.course_ids.map(String).filter(Boolean))] : [],
        }),
  }
}

function courseIds(courses = []) {
  return [...new Set((Array.isArray(courses) ? courses : [])
    .map((course) => String(course?.id || course?.corso_id || course?.course_id || ''))
    .filter(Boolean))]
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function simpleCourseName(course = {}) {
  return String(course.nome || course.name || course.titolo || course.disciplina || 'Corso').trim()
}

function periodLabel(period) {
  if (period === 'trimestrale') return 'Trimestrale'
  if (period === 'annuale') return 'Annuale'
  return 'Mensile'
}

function stripPeriodPrefix(name = '') {
  return String(name || '')
    .replace(/^Mensile\s*[·-]\s*/i, '')
    .replace(/^Trimestrale\s*[·-]\s*/i, '')
    .replace(/^Annuale\s*[·-]\s*/i, '')
    .trim()
}

function packagePeriod(item = {}) {
  const type = String(item.tipo || item.pricing_period || '').toLowerCase()
  if (type === 'trimestrale') return 'trimestrale'
  if (type === 'annuale') return 'annuale'
  if (type === 'gettone') return 'gettone'
  // Le vecchie formule personalizzate possono essere state salvate come
  // "altro" o "all_you_can_dance": se coprono un solo mese le trattiamo
  // comunque come mensili, così la segreteria non resta bloccata da un'etichetta.
  if (Math.max(1, Number(item.durata_mesi || 1)) === 1) return 'mensile'
  return type || 'mensile'
}

export function packageAppliesToCourses(item = {}, courses = []) {
  const allowed = Array.isArray(item.course_ids) ? item.course_ids.map(String).filter(Boolean) : []
  if (!allowed.length) return true
  const selected = courseIds(courses)
  if (!selected.length) return false
  const allowedSet = new Set(allowed)
  // Per le normali formule personalizzate course_ids indica l'area in cui
  // la formula può essere usata. Se nella selezione c'è un corso esterno,
  // la formula non viene proposta come pacchetto completo.
  return selected.every((id) => allowedSet.has(id))
}

function stackableCoveredCount(item = {}) {
  const explicit = Math.floor(Number(item.covered_course_count || 0))
  if (explicit > 0) return explicit

  // Retrocompatibilità: i pacchetti già creati prima di questo campo continuano
  // a funzionare. Se il nome dice "3 ore Country", assumiamo 3 corsi/slot.
  // Altrimenti usiamo tutti i corsi abilitati selezionati nel pacchetto.
  const hourMatch = normalize(item.nome || item.label).match(/(?:^|\s)(\d+)\s+or(?:a|e)(?:\s|$)/)
  if (hourMatch) return Math.max(1, Number(hourMatch[1]))
  const allowed = Array.isArray(item.course_ids) ? [...new Set(item.course_ids.map(String).filter(Boolean))] : []
  return Math.max(1, allowed.length)
}

function stackablePackageMatch(item = {}, courses = [], period = 'mensile', usedIds = new Set()) {
  if (item.attivo === false || item.pricing_key || item.stackable !== true) return null
  if (packagePeriod(item) !== String(period)) return null
  const allowed = Array.isArray(item.course_ids) ? [...new Set(item.course_ids.map(String).filter(Boolean))] : []
  if (!allowed.length) return null

  const allowedSet = new Set(allowed)
  const rows = (Array.isArray(courses) ? courses : []).filter(Boolean)
  const available = rows.filter((course) => {
    const id = String(course?.id || course?.corso_id || course?.course_id || '')
    return id && !usedIds.has(id) && allowedSet.has(id)
  })
  const coveredCount = Math.min(stackableCoveredCount(item), allowed.length)
  if (available.length < coveredCount) return null

  const coveredCourses = available.slice(0, coveredCount)
  const matchedIds = coveredCourses.map((course) => String(course?.id || course?.corso_id || course?.course_id || '')).filter(Boolean)
  return {
    coveredCount,
    matchedIds,
    coveredCourses,
  }
}

function stackableScopeTouchesSelection(item = {}, courses = []) {
  if (item.attivo === false || item.pricing_key || item.stackable !== true) return false
  const allowed = new Set((item.course_ids || []).map(String).filter(Boolean))
  if (!allowed.size) return false
  return courseIds(courses).some((id) => allowed.has(id))
}

export function findPricingPackage(packages = [], group, period = 'mensile', courses = []) {
  if (!group) return null
  const key = group === 'token' ? 'token' : `${group}.${period}`
  const keyed = (packages || [])
    .map(enrichPackagePricingMetadata)
    .filter((item) => item.attivo !== false && item.pricing_key === key)
    .filter((item) => packageAppliesToCourses(item, courses))
  const official = COURSE_PRICE_LIST.find((row) => row.pricing_key === key)
  if (official) {
    const exact = keyed.find((item) => normalize(item.nome || item.label) === normalize(official.nome))
    if (exact) return exact
  }
  return keyed[0] || null
}

export function fallbackPricingPackage(group, period = 'mensile') {
  const key = group === 'token' ? 'token' : `${group}.${period}`
  const item = COURSE_PRICE_LIST.find((row) => row.pricing_key === key)
  return item ? { ...item, id: `builtin:${item.pricing_key}`, attivo: true, course_ids: [], stackable: false } : null
}

function customPackageForPeriod(courses = [], packages = [], period = 'mensile') {
  return (packages || [])
    .map(enrichPackagePricingMetadata)
    .filter((item) => item.attivo !== false
      && !item.pricing_key
      && item.stackable !== true
      && item.tipo === period
      && packageAppliesToCourses(item, courses))
    .sort((a, b) => {
      const aSpecific = Array.isArray(a.course_ids) && a.course_ids.length ? 0 : 1
      const bSpecific = Array.isArray(b.course_ids) && b.course_ids.length ? 0 : 1
      return aSpecific - bSpecific || Number(a.ordine || 0) - Number(b.ordine || 0)
    })[0] || null
}

function resolveBaseCoursePricing(courses = [], packages = [], period = 'mensile') {
  const group = pricingGroupForCourses(courses)
  if (!group) return null
  const catalogItem = findPricingPackage(packages, group, period, courses)
  const customItem = customPackageForPeriod(courses, packages, period)
  const item = catalogItem || fallbackPricingPackage(group, period) || customItem
  if (!item) return null
  const ids = courseIds(courses)
  const names = (Array.isArray(courses) ? courses : []).map(simpleCourseName).filter(Boolean)
  return {
    ...item,
    pricing_group: item.pricing_group || group,
    pricing_group_label: item.pricing_group_label || pricingGroupLabel(group),
    covered_course_ids: ids,
    covered_course_names: names,
  }
}

function selectStackableComponents(courses = [], packages = [], period = 'mensile') {
  const rows = Array.isArray(courses) ? courses.filter(Boolean) : []
  const enriched = (packages || []).map(enrichPackagePricingMetadata)
  const candidates = enriched
    .filter((item) => item.attivo !== false && !item.pricing_key && item.stackable === true)
    .filter((item) => packagePeriod(item) === String(period))
    .sort((a, b) => {
      const aCount = stackableCoveredCount(a)
      const bCount = stackableCoveredCount(b)
      return bCount - aCount || Number(a.ordine || 0) - Number(b.ordine || 0) || Number(a.prezzo || 0) - Number(b.prezzo || 0)
    })

  const used = new Set()
  const components = []
  for (const item of candidates) {
    const match = stackablePackageMatch(item, rows, period, used)
    if (!match) continue
    match.matchedIds.forEach((id) => used.add(id))
    components.push({
      ...item,
      covered_course_count: match.coveredCount,
      covered_course_ids: match.matchedIds,
      covered_course_names: match.coveredCourses.map(simpleCourseName),
      component_source: 'custom',
    })
  }

  const remaining = rows.filter((course) => !used.has(String(course?.id || course?.corso_id || course?.course_id || '')))
  return { components, remaining }
}

function componentDisplayName(item = {}, courses = []) {
  if (item.component_source === 'custom') return stripPeriodPrefix(item.nome)
  const names = item.covered_course_names || (Array.isArray(courses) ? courses.map(simpleCourseName) : [])
  if (names.length === 1) return names[0]
  return stripPeriodPrefix(item.nome || item.pricing_group_label || 'Quota corsi')
}

function buildCompositePackage({ courses = [], customComponents = [], remainderPackage = null, period = 'mensile' }) {
  const parts = customComponents.map((item) => ({
    id: String(item.id || item.nome),
    package_id: item.id || null,
    nome: componentDisplayName(item),
    prezzo: roundMoney(item.prezzo),
    course_ids: [...(item.covered_course_ids || item.course_ids || [])],
    course_names: [...(item.covered_course_names || [])],
    source: 'custom',
  }))

  if (remainderPackage) {
    parts.push({
      id: String(remainderPackage.id || remainderPackage.pricing_key || remainderPackage.nome),
      package_id: remainderPackage.id || null,
      nome: componentDisplayName(remainderPackage),
      prezzo: roundMoney(remainderPackage.prezzo),
      course_ids: [...(remainderPackage.covered_course_ids || [])],
      course_names: [...(remainderPackage.covered_course_names || [])],
      source: 'automatic',
    })
  }

  if (!parts.length) return null
  if (parts.length === 1 && customComponents.length === 1 && !remainderPackage) {
    const only = customComponents[0]
    return {
      ...only,
      pricing_group: 'custom_component',
      pricing_group_label: 'Quota personalizzata del corso',
      components: parts,
      is_composite: false,
    }
  }

  const total = roundMoney(parts.reduce((sum, item) => sum + Number(item.prezzo || 0), 0))
  const label = parts.map((item) => item.nome).join(' + ')
  const ids = parts.map((item) => item.id).join('|')
  const months = period === 'trimestrale' ? 3 : period === 'annuale' ? 12 : 1
  const minimumOrder = Math.min(...[...customComponents, remainderPackage].filter(Boolean).map((item) => Number(item.ordine || 10)))

  return {
    id: `composite:${period}:${ids}`,
    pricing_key: null,
    pricing_group: 'composite',
    pricing_period: period,
    pricing_group_label: `Quota composta · ${parts.length} voci`,
    nome: `${periodLabel(period)} · ${label}`,
    tipo: period,
    durata_mesi: months,
    prezzo: total,
    descrizione: parts.map((item) => `${item.nome} ${roundMoney(item.prezzo).toFixed(2)} €`).join(' + '),
    ordine: Number.isFinite(minimumOrder) ? minimumOrder : 10,
    attivo: true,
    course_ids: [],
    covered_course_ids: courseIds(courses),
    covered_course_names: (Array.isArray(courses) ? courses : []).map(simpleCourseName),
    components: parts,
    is_composite: true,
    stackable: false,
    special: true,
  }
}

/**
 * Risolve la quota principale. Se esistono pacchetti personalizzati marcati
 * "componente cumulabile", Nova li applica al numero previsto di corsi dentro
 * il bacino abilitato e calcola
 * il listino automatico solo sui corsi rimanenti.
 *
 * Esempio: Country 1 corso e mezzo = 45 € (componente) + Kizomba base = 40 €
 * => quota mensile composta = 85 €.
 */
export function resolveCoursePricing(courses = [], packages = [], period = 'mensile') {
  const rows = (Array.isArray(courses) ? courses : []).filter(Boolean)
  if (!rows.length) return null

  const { components: customComponents, remaining } = selectStackableComponents(rows, packages, period)
  if (!customComponents.length) return resolveBaseCoursePricing(rows, packages, period)

  const remainderPackage = remaining.length ? resolveBaseCoursePricing(remaining, packages, period) : null
  // Se resta un gruppo di corsi che non siamo in grado di quotare, non rischiamo
  // di proporre una quota incompleta: torniamo al listino normale dell'intera selezione.
  if (remaining.length && !remainderPackage) return resolveBaseCoursePricing(rows, packages, period)

  return buildCompositePackage({ courses: rows, customComponents, remainderPackage, period })
}

export function halfMonthPackageForPricing(monthlyPackage) {
  if (!monthlyPackage || monthlyPackage.tipo !== 'mensile' || monthlyPackage.tipo === 'omaggio' || monthlyPackage.tipo === 'gettone') return null
  const fullPrice = roundMoney(monthlyPackage.prezzo)
  if (fullPrice <= 0) return null

  const sourceComponents = Array.isArray(monthlyPackage.components) && monthlyPackage.components.length
    ? monthlyPackage.components
    : [{
        id: String(monthlyPackage.id || monthlyPackage.pricing_key || monthlyPackage.nome),
        package_id: monthlyPackage.id || null,
        nome: monthlyPackage.covered_course_names?.length === 1
          ? monthlyPackage.covered_course_names[0]
          : stripPeriodPrefix(monthlyPackage.nome || monthlyPackage.pricing_group_label),
        prezzo: fullPrice,
        course_ids: [...(monthlyPackage.covered_course_ids || [])],
        course_names: [...(monthlyPackage.covered_course_names || [])],
        source: monthlyPackage.pricing_key ? 'automatic' : 'custom',
      }]

  const halfComponents = sourceComponents.map((component) => ({
    ...component,
    nome: `½ ${component.nome}`,
    prezzo: roundMoney(Number(component.prezzo || 0) / 2),
  }))
  // Evitiamo differenze di 1 centesimo dovute agli arrotondamenti delle singole voci.
  const expectedTotal = roundMoney(fullPrice / 2)
  const calculated = roundMoney(halfComponents.reduce((sum, item) => sum + item.prezzo, 0))
  if (halfComponents.length && calculated !== expectedTotal) {
    halfComponents[halfComponents.length - 1].prezzo = roundMoney(halfComponents[halfComponents.length - 1].prezzo + expectedTotal - calculated)
  }

  const baseLabel = monthlyPackage.is_composite
    ? stripPeriodPrefix(monthlyPackage.nome)
    : monthlyPackage.covered_course_names?.length === 1
      ? monthlyPackage.covered_course_names[0]
      : stripPeriodPrefix(monthlyPackage.nome || monthlyPackage.pricing_group_label)

  return {
    ...monthlyPackage,
    id: `half:${String(monthlyPackage.id || monthlyPackage.pricing_key || monthlyPackage.nome)}`,
    pricing_key: null,
    pricing_group: 'half_month',
    pricing_period: 'mensile',
    pricing_group_label: 'Metà mese calcolata automaticamente',
    nome: `Metà mese · ${baseLabel}`,
    tipo: 'mensile',
    durata_mesi: 1,
    prezzo: expectedTotal,
    descrizione: `50% della quota mensile di ${fullPrice.toFixed(2)} €`,
    ordine: Number(monthlyPackage.ordine || 10) - 0.5,
    components: halfComponents,
    is_composite: monthlyPackage.is_composite === true,
    is_half_month: true,
    full_month_price: fullPrice,
    special: true,
    stackable: false,
  }
}

function isLegacyManualHalfMonth(item = {}) {
  // Dalla nuova logica la metà mese viene calcolata sulla quota reale del corsista.
  // Il vecchio pacchetto generico "Metà mese" (es. 20 €) viene quindi nascosto
  // dai flussi operativi per evitare importi sbagliati sulle quote composte.
  return !item.pricing_key && item.stackable !== true && normalize(item.nome || item.label) === 'meta mese'
}

export function packagesForCourseSelection(courses = [], packages = []) {
  const rows = (Array.isArray(courses) ? courses : []).filter(Boolean)
  const enriched = (packages || []).map(enrichPackagePricingMetadata).filter((item) => item.attivo !== false)
  const applicable = enriched.filter((item) => packageAppliesToCourses(item, rows))
  const gift = [{ ...GIFT_PACKAGE, course_ids: [], stackable: false }]

  const applicableTokens = applicable.filter((item) => item.pricing_key === 'token' || item.tipo === 'gettone')
  const specificTokens = applicableTokens.filter((item) => item.course_ids?.length)
  const token = specificTokens.length ? specificTokens : applicableTokens
  if (!token.length) {
    const fallbackToken = fallbackPricingPackage('token')
    if (fallbackToken) token.push(fallbackToken)
  }

  const hasCustomStackableScope = enriched.some((item) => stackableScopeTouchesSelection(item, rows))
  const resolved = ['mensile', 'trimestrale', 'annuale']
    .map((period) => {
      if (!hasCustomStackableScope) return resolveCoursePricing(rows, enriched, period)
      const periodComponents = selectStackableComponents(rows, enriched, period).components
      // Se questa iscrizione ricade in una tariffa speciale cumulabile, non proponiamo
      // un trimestrale/annuale generico che ignorerebbe le regole dell'insegnante.
      if (!periodComponents.length) return null
      return resolveCoursePricing(rows, enriched, period)
    })
    .filter(Boolean)

  const monthly = resolved.find((item) => item.tipo === 'mensile' && !item.is_half_month) || resolveCoursePricing(rows, enriched, 'mensile')
  const halfMonth = halfMonthPackageForPricing(monthly)

  const selectedIds = new Set(courseIds(rows))
  const custom = applicable.filter((item) => {
    if (item.pricing_key || item.tipo === 'gettone' || isLegacyManualHalfMonth(item)) return false
    if (item.stackable === true) {
      const match = stackablePackageMatch(item, rows, packagePeriod(item))
      // Una componente non viene mostrata come pagamento isolato se copre solo
      // una parte dei corsi: in quel caso compare dentro la quota composta.
      return Boolean(match && match.matchedIds.length === selectedIds.size)
    }
    return true
  })

  const seen = new Set()
  return [...gift, ...token, ...(halfMonth ? [halfMonth] : []), ...resolved, ...custom]
    .sort((a, b) => Number(a.ordine || 0) - Number(b.ordine || 0))
    .filter((item) => {
      const key = String(item.id || item.pricing_key || item.nome)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
