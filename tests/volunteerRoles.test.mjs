import test from 'node:test'
import assert from 'node:assert/strict'
import { getVolunteerRoleOptions, volunteerRoleCode } from '../src/lib/volunteerRoles.js'

test('Le voci storiche rimangono disponibili prima della configurazione', () => {
  const roles = getVolunteerRoleOptions([])
  assert.equal(roles.length, 7)
  assert.ok(roles.some((item) => item.value === 'barman' && item.isActive))
})

test('Addetto cassa compare dal catalogo Conti', () => {
  const roles = getVolunteerRoleOptions([{ value: 'addetto_cassa', label: 'Addetto cassa', is_active: true }])
  assert.deepEqual(roles, [{ value: 'addetto_cassa', label: 'Addetto cassa', isActive: true }])
})

test('Rinominare il ruolo non cambia il codice associato ai volontari', () => {
  const roles = getVolunteerRoleOptions([{ value: 'barman', label: 'Responsabile bar', is_active: true }])
  assert.equal(roles[0].value, 'barman')
  assert.equal(roles[0].label, 'Responsabile bar')
})

test('Un ruolo disattivato resta leggibile nello storico', () => {
  const roles = getVolunteerRoleOptions([{ value: 'addetto_cassa', label: 'Cassa', is_active: false }], ['addetto_cassa', 'cameriere'])
  assert.equal(roles.find((r) => r.value === 'addetto_cassa')?.isActive, false)
  assert.equal(roles.find((r) => r.value === 'cameriere')?.label, 'Cameriere')
  assert.equal(roles.find((r) => r.value === 'cameriere')?.isActive, false)
})

test('Codice ricavato automaticamente dall’etichetta', () => {
  assert.equal(volunteerRoleCode('Addetto cassa'), 'addetto_cassa')
  assert.equal(volunteerRoleCode('Cassa & accoglienza'), 'cassa_accoglienza')
})
