import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateOrchideaBridgeRoute } from '../api/orchidea-payments-read.js'

test('permits only the bounded Orchidea tables and Nova RPCs', () => {
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/tesseramenti?select=id,nome', 'GET'), true)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/corsi?select=*', 'GET'), true)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/iscrizioni_corsi', 'POST'), true)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/pagamenti?select=id', 'GET'), true)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/pagamenti?id=eq.123', 'PATCH'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/tesseramenti', 'DELETE'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/rpc/nova_update_tesseramento', 'POST'), true)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/rpc/nova_tesseramenti_list', 'POST'), true)
})
test('blocks unknown resources and arbitrary privileged RPCs', () => {
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/profiles', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/auth.users', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/rpc/verify_password_reset_identity', 'POST'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/rpc/admin_set_allievo_password', 'POST'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/rpc/nova_update_tesseramento', 'DELETE'), false)
})
test('blocks outbound URLs, path traversal, encoded paths and oversized queries', () => {
  assert.equal(validateOrchideaBridgeRoute('https://attacker.invalid/rest/v1/pagamenti', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/../auth/v1/admin', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/%70agamenti', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/tesseramenti#fragment', 'GET'), false)
  assert.equal(validateOrchideaBridgeRoute('/rest/v1/pagamenti?select=' + 'x'.repeat(4000), 'GET'), false)
})
test('Nova operator authorization remains upstream of the proxy', () => {
  const source = readFileSync(new URL('../api/orchidea-payments-read.js', import.meta.url), 'utf8')
  assert.ok(source.includes('await requireNovaOperator(req)'))
  assert.ok(source.indexOf('await requireNovaOperator(req)') < source.indexOf("if (req.method === 'POST' && req.body?.operation === 'postgrest-bridge')"))
  assert.ok(source.includes("Authorization: 'Bearer ' + key"))
})

test('admin canary keeps all connectivity probes read-only and admin-only', () => {
  const utilities = readFileSync(new URL('../src/pages/UtilitaPage.jsx', import.meta.url), 'utf8')
  const router = readFileSync(new URL('../src/app/router.jsx', import.meta.url), 'utf8')
  assert.ok(router.includes("roles={['admin']}><UtilitaPage />"))
  for (const table of ['tesseramenti','pagamenti','iscrizioni_corsi','corsi','insegnanti_corsi','nova_package_pricing_history']) {
    assert.equal(validateOrchideaBridgeRoute('/rest/v1/' + table + '?select=id&limit=1', 'HEAD'), true)
    assert.ok(utilities.includes("'" + table + "'"))
  }
  assert.ok(utilities.includes("httpMethod: 'HEAD'"))
  assert.ok(utilities.includes('securityChecks?.allOk'))
  assert.ok(utilities.includes("window.sessionStorage.removeItem(ORCHIDEA_CANARY_STORAGE_KEY)"))
})
