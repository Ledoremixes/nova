import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import dayjs from 'dayjs'

// Exercise the real payment writer, replacing only its external dependencies.
const source = readFileSync(new URL('../src/api/orchideaPayments.js', import.meta.url), 'utf8')
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to))
const writerSource = section('function allocatePackageAmount(', 'const PAYMENT_ROLLBACK_FIELDS')
  + section('function packageComponentsNote(', 'export async function setAllievoMonthlyPayment(').replace('export async function', 'async function')

function harness(failOn = 0) {
  const written = []
  const rollback = []
  const client = { from() { return {
    select() { return this }, eq() { return this }, in() { return this },
    order: async () => ({ data: [], error: null }),
    insert(rows) {
      return { select() { return this }, single: async () => {
        if (written.length + 1 === failOn) return { error: { message: 'simulated write failure' } }
        const row = { ...rows[0], id: `payment-${written.length + 1}` }
        written.push(row)
        return { data: row, error: null }
      } }
    },
  } } }
  const write = new Function('dayjs', 'orchideaSupabase', 'moneyRound', 'euro', 'fetchStudentMonthlyDue', 'createPaymentGroupId', 'uuidOrNull', 'paymentWriteWithLegacyFallback', 'invalidatePaymentsReadCache', 'rollbackPackagePaymentWrites', writerSource + '\nreturn setAllievoPackagePayment')(
    dayjs, client, n => Math.round(Number(n) * 100) / 100, n => `${n} EUR`, async () => 119, () => 'one-payment-group', () => null, (fn, payload) => fn(payload), () => {}, async snapshot => { rollback.push(snapshot); return true },
  )
  return { write, written, rollback }
}
const packageItem = {
  id: 'combined:country+kizomba', nome: 'Country 3 ore Trimestrale + Kizomba Trimestrale',
  tipo: 'trimestrale', durata_mesi: 3, prezzo: 225,
  components: [{ id: 'country', nome: 'Country 3 ore Trimestrale', prezzo: 135 }, { id: 'kizomba', nome: 'Kizomba Trimestrale', prezzo: 90 }],
}

test('225 EUR combination is one receipt, three covered months and retains both package names', async () => {
  const { write, written } = harness()
  const result = await write({ tesseramentoId: 'fixture-student', startMonth: '2026-10', packageItem, amount: 225 })
  assert.deepEqual(result.months, ['2026-10', '2026-11', '2026-12'])
  assert.equal(result.cashAmount, 225)
  assert.deepEqual(written.map(r => r.importo), [75, 75, 75])
  assert.equal(written.reduce((sum, r) => sum + r.nova_cash_amount, 0), 225)
  assert.equal(new Set(written.map(r => r.nova_payment_group_id)).size, 1)
  for (const row of written) {
    assert.equal(row.nova_coverage_complete, true)
    assert.equal(row.nova_package_total, 225)
    assert.equal(row.nova_coverage_to, '2026-12-31')
    assert.match(row.note, /Country 3 ore Trimestrale 135 EUR \+ Kizomba Trimestrale 90 EUR/)
  }
})

test('failed second month invokes rollback of the first month', async () => {
  const { write, rollback } = harness(2)
  await assert.rejects(write({ tesseramentoId: 'fixture-student', startMonth: '2026-10', packageItem, amount: 225 }), /annullate/)
  assert.deepEqual(rollback[0].createdIds, ['payment-1'])
})
