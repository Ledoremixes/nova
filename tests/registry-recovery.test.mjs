import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildOpesCsv } from '../src/lib/opesCsv.js'

const source = readFileSync(new URL('../src/api/tesserati.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export /g, '')

function registry({ authenticated = false, directError = null } = {}) {
  const students = Array.from({ length: 1501 }, (_, id) => ({ id, nome: 'Test', is_corsista: id % 2 === 0 }))
  const calls = []
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } }
  const orchidea = {
    from(table) {
      calls.push({ table })
      return {
        select() { return this },
        order() { return this },
        async range(start, end) {
          calls.push({ start, end })
          return { data: directError ? null : students.slice(start, end + 1), error: directError }
        },
      }
    },
    async rpc() { throw new Error('Bridge unavailable') },
  }
  const fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ students, total: students.length }) }
  }
  const api = new Function('supabase', 'orchideaSupabase', 'getOrchideaConfigStatus', 'hasDedicatedOrchideaConfig', 'getOrchideaAuthStatus', 'fetch', source + '\nreturn { fetchTesserati, invalidateTesseratiCache }')(
    supabase, orchidea, () => ({ mode: 'dedicated' }), true, async () => ({ authenticated }), fetch,
  )
  return { api, calls }
}

test('Nova operator without a second session loads all 1501 members through authenticated server endpoint', async () => {
  const { api, calls } = registry()
  const rows = await api.fetchTesserati()
  assert.equal(rows.length, 1501)
  assert.equal(rows.sourceTable, 'tesseramenti')
  assert.equal(calls[0].url, '/api/orchidea-students')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
  assert.equal(calls.some(call => call.table), false)
})

test('direct authenticated query loads members beyond 1000', async () => {
  const { api, calls } = registry({ authenticated: true })
  assert.equal((await api.fetchTesserati()).length, 1501)
  assert.deepEqual(calls.filter(call => call.start !== undefined), [{ start: 0, end: 999 }, { start: 1000, end: 1999 }])
})

test('direct permission failure recovers through the authenticated server endpoint', async () => {
  const { api, calls } = registry({ authenticated: true, directError: { code: '42501', message: 'permission denied' } })
  assert.equal((await api.fetchTesserati()).length, 1501)
  assert.equal(calls.filter(call => call.url).length, 1)
})

test('OPES CSV retains format, birth date, deduplication and invalid-record reporting', () => {
  const student = { nome: 'Mario', cognome: 'Rossi', cf: 'RSSMRA80A01H501U' }
  const result = buildOpesCsv([student, student, { cf: 'INVALID' }])
  assert.equal(result.exportedCount, 1)
  assert.equal(result.skipped.length, 1)
  assert.ok(result.csv.startsWith('\uFEFFClasse tesseramento;'))
  assert.ok(result.csv.includes('A;APR;09/10/2026;31/08/2027;BC006;;;RSSMRA80A01H501U;Rossi;Mario;01/01/1980;M;;\r\n'))
})
