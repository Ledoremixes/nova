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
  if (item.pricing_key) return String(item.pricing_key)
  const name = normalize(item.nome || item.label)
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
  }
}

export function findPricingPackage(packages = [], group, period = 'mensile') {
  if (!group) return null
  const key = group === 'token' ? 'token' : `${group}.${period}`
  return (packages || [])
    .map(enrichPackagePricingMetadata)
    .find((item) => item.attivo !== false && item.pricing_key === key) || null
}

export function fallbackPricingPackage(group, period = 'mensile') {
  const key = group === 'token' ? 'token' : `${group}.${period}`
  const item = COURSE_PRICE_LIST.find((row) => row.pricing_key === key)
  return item ? { ...item, id: `builtin:${item.pricing_key}`, attivo: true } : null
}

export function resolveCoursePricing(courses = [], packages = [], period = 'mensile') {
  const group = pricingGroupForCourses(courses)
  if (!group) return null
  const catalogItem = findPricingPackage(packages, group, period)
  const item = catalogItem || fallbackPricingPackage(group, period)
  if (!item) return null
  return {
    ...item,
    pricing_group: group,
    pricing_group_label: pricingGroupLabel(group),
  }
}

export function packagesForCourseSelection(courses = [], packages = []) {
  const group = pricingGroupForCourses(courses)
  const enriched = (packages || []).map(enrichPackagePricingMetadata).filter((item) => item.attivo !== false)
  const gift = [{ ...GIFT_PACKAGE }]
  const token = enriched.filter((item) => item.pricing_key === 'token' || item.tipo === 'gettone')
  if (!token.length) {
    const fallbackToken = fallbackPricingPackage('token')
    if (fallbackToken) token.push(fallbackToken)
  }
  const matched = group
    ? ['mensile', 'trimestrale', 'annuale']
      .map((period) => findPricingPackage(enriched, group, period) || fallbackPricingPackage(group, period))
      .filter(Boolean)
    : []
  const custom = enriched.filter((item) => !item.pricing_key && item.tipo !== 'gettone')

  const seen = new Set()
  return [...gift, ...token, ...matched, ...custom].filter((item) => {
    const key = String(item.id || item.pricing_key || item.nome)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
