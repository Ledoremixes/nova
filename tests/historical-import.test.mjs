import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/orchidea-historical-memberships.js'
import { isValidHistoricalCf, splitHistoricalRecords } from '../src/lib/historicalFiscalCode.js'

const VALID_CF = 'RSSMRA85T10A562S'
const validRecord = {
  cf: VALID_CF, nome: 'Mario', cognome: 'Rossi', email: 'mario@example.invalid',
  nascita: '1985-12-10', accepted_at: '2026-05-23T10:00:00Z', source_message_id: 'test-valid',
}

async function request(records, { existing = null } = {}) {
  const environment = {
    SUPABASE_URL: 'https://nova.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    ORCHIDEA_SUPABASE_URL: 'https://orchidea.invalid', ORCHIDEA_SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  }
  const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]))
  Object.assign(process.env, environment)
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input))
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ url, method, body })
    const reply = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.hostname === 'nova.invalid' && url.pathname === '/auth/v1/user') {
      return reply({ id: 'operator', email: 'admin@example.invalid' })
    }
    if (url.hostname === 'nova.invalid' && url.pathname === '/rest/v1/users') {
      return reply([{ role: 'admin', is_active: true, email: 'admin@example.invalid' }])
    }
    if (url.hostname === 'orchidea.invalid' && url.pathname === '/rest/v1/tesseramenti') {
      if (method === 'GET') return reply(existing ? [existing] : [])
      if (method === 'POST') return reply({ id: 'new-student', ...body[0] })
    }
    throw new Error(`Unexpected request: ${method} ${url.origin}${url.pathname}`)
  }
  const response = {
    statusCode: null, payload: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload },
  }
  try {
    await handler({
      method: 'POST', headers: { authorization: 'Bearer test-token' },
      body: { format: 'nova_historical_membership_import', version: 1, records },
    }, response)
    return { ...response, calls }
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('formal validation includes normalization, omocodia, checksum and structure', () => {
  assert.equal(isValidHistoricalCf(' rssmra85t10a562s '), true)
  assert.equal(isValidHistoricalCf('RSSMRA85T10A56NH'), true)
  for (const cf of ['', null, '22010', 'DVTLSS89@GMAIL.COM', 'RSSMRA85T10A562A', 'RSSMRA85Z10A562S']) {
    assert.equal(isValidHistoricalCf(cf), false)
  }
  // The uploaded flag cannot bypass the validation or exclude a corrected code.
  const split = splitHistoricalRecords([
    { cf: '22010', cf_formally_valid: true },
    { cf: VALID_CF, cf_formally_valid: false },
  ])
  assert.equal(split.eligible.length, 1)
  assert.equal(split.eligible[0].cf, VALID_CF)
})

test('invalid codes cause no Orchidea registry or storage calls even with a signature and a true flag', async () => {
  const result = await request([{ ...validRecord, cf: '22010', cf_formally_valid: true, signature_data_url: 'pretend-signature' }])
  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.summary.skipped_invalid_cf, 1)
  assert.equal(result.payload.summary.inserted, 0)
  assert.equal(result.calls.filter((call) => call.url.hostname === 'orchidea.invalid').length, 0)
})

test('a mixed legacy batch inserts only the eligible person and never creates an Auth account', async () => {
  const result = await request([
    { ...validRecord, cf: '22010', signature_data_url: 'pretend-signature' },
    validRecord,
  ])
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.payload.summary.errors, [])
  assert.equal(result.payload.summary.inserted, 1)
  assert.equal(result.payload.summary.skipped_invalid_cf, 1)
  const writes = result.calls.filter((call) => call.method !== 'GET')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].body[0].cf, VALID_CF)
  assert.equal(writes[0].body[0].auth_user_id, null)
})

test('an existing person is left unchanged in a batch containing an invalid code', async () => {
  const existing = { ...validRecord, id: 'already-present', nome: 'Nome già corretto', telefono: '1234' }
  const result = await request([{ ...validRecord, cf: '22010' }, validRecord], { existing })
  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.summary.skipped_existing, 1)
  assert.equal(result.payload.summary.inserted, 0)
  assert.equal(result.calls.filter((call) => call.method !== 'GET').length, 0)
})
