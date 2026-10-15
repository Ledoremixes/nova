import test from 'node:test'
import assert from 'node:assert/strict'
import { selectableCoursePackages, toggleCoursePackage, composeCoursePackages } from '../src/lib/packageSelection.js'
import { enrichPackagePricingMetadata } from '../src/lib/coursePriceList.js'

const courses = [
  { id: 'c1', nome: 'Country Avanzato' },
  { id: 'c2', nome: 'Country Intermedio 1' },
  { id: 'c3', nome: 'Country Intermedio 2' },
  { id: 'k', nome: 'Kizomba Base' },
]
const catalog = [
  { id: 'country3', nome: 'Country 3 ore Trimestrale', tipo: 'trimestrale', durata_mesi: 3, prezzo: 135, course_ids: ['c1', 'c2', 'c3'] },
  { id: 'kizomba', nome: 'Kizomba Trimestrale', tipo: 'trimestrale', durata_mesi: 3, prezzo: 90, course_ids: ['k'] },
  { id: 'salsa', nome: 'Salsa Trimestrale', tipo: 'trimestrale', durata_mesi: 3, prezzo: 110, course_ids: ['s'] },
]

test('Elvia: both course-specific packages remain available and sum to 225', () => {
  const options = selectableCoursePackages(courses, catalog)
  const country = options.find(p => p.catalog_id === 'country3')
  const kizomba = options.find(p => p.catalog_id === 'kizomba')
  assert.ok(country && kizomba)
  assert.equal(options.some(p => p.catalog_id === 'salsa'), false)
  let selected = toggleCoursePackage([], country, options)
  assert.match(composeCoursePackages(selected, options, courses).error, /Kizomba Base/)
  selected = toggleCoursePackage(selected, kizomba, options)
  const { packageItem, error } = composeCoursePackages(selected, options, courses)
  assert.equal(error, '')
  assert.equal(packageItem.prezzo, 225)
  assert.equal(packageItem.durata_mesi, 3)
  assert.equal(packageItem.components.length, 2)
  assert.deepEqual(packageItem.coverage_course_ids.sort(), ['c1', 'c2', 'c3', 'k'])
  assert.equal(packageItem.nome.includes('All You Can Dance'), false)
})

test('legacy offers without course_ids are scoped by discipline and hours', () => {
  const options = selectableCoursePackages(courses, catalog.map(({ course_ids, ...item }) => item))
  assert.deepEqual(options.find(p => p.catalog_id === 'country3').coverage_course_ids, ['c1', 'c2', 'c3'])
  assert.deepEqual(options.find(p => p.catalog_id === 'kizomba').coverage_course_ids, ['k'])
  assert.equal(options.some(p => p.catalog_id === 'salsa'), false)
  assert.equal(enrichPackagePricingMetadata(catalog[0]).pricing_key, null)
  assert.equal(selectableCoursePackages(courses.slice(1), catalog).some(p => p.catalog_id === 'country3'), false)
})

test('AYCD is optional and replaces the combination instead of double charging', () => {
  const options = selectableCoursePackages(courses, catalog)
  const chosen = options.filter(p => ['country3', 'kizomba'].includes(p.catalog_id)).map(p => p.id)
  const unlimited = options.find(p => p.pricing_key === 'unlimited.trimestrale')
  assert.deepEqual(toggleCoursePackage(chosen, unlimited, options), [unlimited.id])
  assert.equal(composeCoursePackages([], options, courses).packageItem, null)
})

test('overlap, changed catalog and incomplete coverage cannot mark the whole month paid', () => {
  const options = selectableCoursePackages(courses, catalog)
  const country = options.find(p => p.catalog_id === 'country3')
  const unlimited = options.find(p => p.pricing_key === 'unlimited.trimestrale')
  assert.match(composeCoursePackages([country.id, unlimited.id], options, courses).error, /stesso corso/)
  assert.match(composeCoursePackages(['removed'], options, courses).error, /cambiati/)
  assert.equal(composeCoursePackages([country.id], options, courses).packageItem, null)
})

test('switching duration replaces incompatible packages; toggling removes a selection', () => {
  const options = selectableCoursePackages(courses, catalog)
  const country = options.find(p => p.catalog_id === 'country3')
  const monthly = options.find(p => p.tipo === 'mensile' && p.coverage_course_ids.length === 1 && p.coverage_course_ids[0] === 'k')
  assert.deepEqual(toggleCoursePackage([country.id], monthly, options), [monthly.id])
  assert.deepEqual(toggleCoursePackage([country.id], country, options), [])
})
