import { packagesForCourseSelection, enrichPackagePricingMetadata } from './coursePriceList.js'

const text = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const ids = (courses) => [...new Set(courses.map(c => String(c.id || c.corso_id || '')).filter(Boolean))]
const key = (item) => String(item.id || item.pricing_key)

export function selectableCoursePackages(courses = [], catalog = []) {
  const allIds = ids(courses)
  if (!allIds.length) return []
  const result = new Map()
  function add(item, covered) {
    if (!covered.length) return
    const id = key(item)
    // A generic single-course offer needs a distinct selection for each course.
    const scopedId = covered.length === allIds.length ? id : `${id}@${covered.slice().sort().join(',')}`
    result.set(scopedId, { ...item, id: scopedId, catalog_id: item.id, coverage_course_ids: covered, combinable: covered.length < allIds.length && !['omaggio', 'gettone'].includes(item.tipo) })
  }
  // Whole-archive offers (including AYCD) remain optional alternatives.
  for (const item of packagesForCourseSelection(courses, catalog)) {
    if (item.pricing_key || item.tipo === 'omaggio' || item.tipo === 'gettone') add(item, allIds)
  }
  const normalized = catalog.map(enrichPackagePricingMetadata).filter(p => p.attivo !== false)
  const countryIds = ids(courses.filter(c => /\bcountry\b/.test(text(`${c.nome} ${c.disciplina || ''}`))))
  for (const item of normalized.filter(p => !p.pricing_key && !['omaggio', 'gettone'].includes(p.tipo))) {
    let covered
    const name = text(item.nome)
    const hours = name.match(/\b(\d+)\s*ore?\b/)
    // Hour bundles cover the enrolled Country levels as one discipline, even
    // when a legacy catalog row still lists only some of those levels.
    if (/\bcountry\b/.test(name) && hours) {
      covered = countryIds
    } else if (item.course_ids?.length) {
      covered = allIds.filter(id => item.course_ids.map(String).includes(id))
    } else {
      // Compatibility for existing named offers saved before course assignment.
      const name = text(item.nome)
      const disciplines = ['country', 'kizomba', 'bachata', 'salsa', 'lady style', 'primi passi'].filter(d => name.includes(d))
      covered = disciplines.length ? ids(courses.filter(c => disciplines.some(d => text(`${c.nome} ${c.disciplina || ''}`).includes(d)))) : allIds
    }
    const required = Number(item.covered_course_count || hours?.[1] || 0)
    if (required && covered.length !== required) continue
    // A one-course Country tariff must not be presented as a three-hour bundle.
    if (countryIds.length === 3 && /\bcountry\b/.test(name) && !hours) continue
    add(item, covered)
  }
  // Agreed three-hour Country quarterly tariff. Keep it available even when
  // the legacy catalog has only the monthly bundle or stale course mappings.
  if (countryIds.length === 3 && ![...result.values()].some(p =>
    /\bcountry\b/.test(text(p.nome)) && /\b3\s*ore?\b/.test(text(p.nome)) && Number(p.durata_mesi) === 3)) {
    add({ id: 'builtin:country-3-hours-quarterly', nome: 'Country 3 ore Trimestrale', tipo: 'trimestrale', durata_mesi: 3, prezzo: 135, ordine: 1 }, countryIds)
  }
  const bundledIds = new Set([...result.values()]
    .filter(p => !p.pricing_key && p.coverage_course_ids.length > 1 && /\b(country|kizomba|bachata|salsa)\b/.test(text(p.nome)) && !['omaggio', 'gettone'].includes(p.tipo))
    .flatMap(p => p.coverage_course_ids))
  // Also offer the ordinary rate for each enrolled course; a dedicated catalog
  // offer for the same course/period takes precedence over a generic fallback.
  for (const course of courses) {
    const covered = ids([course])
    if (covered.some(id => bundledIds.has(id))) continue
    for (const item of packagesForCourseSelection([course], catalog)) {
      if (!item.pricing_key || ['gift', 'token'].includes(item.pricing_key)) continue
      if ([...result.values()].some(p => !p.pricing_key && p.tipo === item.tipo && p.coverage_course_ids.length === 1 && p.coverage_course_ids[0] === covered[0])) continue
      add({ ...item, nome: `${item.nome} · ${course.nome || 'Corso'}` }, covered)
    }
  }
  return [...result.values()].sort((a, b) => Number(a.ordine || 0) - Number(b.ordine || 0))
}

export function toggleCoursePackage(selectedIds, item, options) {
  const id = key(item)
  if (selectedIds.includes(id)) return selectedIds.filter(value => value !== id)
  if (!item.combinable) return [id]
  const covered = new Set(item.coverage_course_ids)
  return [...selectedIds.filter(value => {
    const previous = options.find(p => key(p) === value)
    return previous?.combinable && Number(previous.durata_mesi) === Number(item.durata_mesi)
      && !previous.coverage_course_ids.some(courseId => covered.has(courseId))
  }), id]
}

export function composeCoursePackages(selectedIds, options, courses) {
  const selected = selectedIds.map(id => options.find(p => key(p) === id)).filter(Boolean)
  if (selected.length !== selectedIds.length) return { packageItem: null, error: 'I corsi o il listino sono cambiati. Seleziona di nuovo i pacchetti.' }
  if (!selected.length) return { packageItem: null, error: '' }
  const covered = selected.flatMap(p => p.coverage_course_ids)
  if (new Set(covered).size !== covered.length) return { packageItem: null, error: 'Due pacchetti coprono lo stesso corso.' }
  if (selected.some(p => Number(p.durata_mesi) !== Number(selected[0].durata_mesi))) return { packageItem: null, error: 'Scegli pacchetti con la stessa durata.' }
  const missing = courses.filter(c => !covered.includes(String(c.id || c.corso_id)))
  if (missing.length) return { packageItem: null, error: `Aggiungi il pacchetto per: ${missing.map(c => c.nome || 'Corso').join(', ')}.` }
  if (selected.length === 1) return { packageItem: selected[0], error: '' }
  return {
    error: '',
    packageItem: {
      id: `combined:${selected.map(key).sort().join('+')}`,
      nome: selected.map(p => p.nome).join(' + '),
      tipo: selected[0].tipo,
      durata_mesi: Number(selected[0].durata_mesi),
      prezzo: Math.round(selected.reduce((sum, p) => sum + Number(p.prezzo), 0) * 100) / 100,
      coverage_course_ids: covered,
      components: selected.map(p => ({ id: p.catalog_id || p.id, nome: p.nome, prezzo: Number(p.prezzo), course_ids: p.coverage_course_ids })),
    },
  }
}
