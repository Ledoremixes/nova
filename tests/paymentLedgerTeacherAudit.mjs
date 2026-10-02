import assert from 'node:assert/strict'
import { summarizeMonthlyTuitionPayments } from '../src/lib/paymentLedger.js'

const base = { tesseramento_id: 's1', periodo: '2026-10', tipo: 'quota_mensile', stato: 'pagato', data_pagamento: '2026-10-01' }

// quota mensile normale
{
  const result = summarizeMonthlyTuitionPayments({ payments: [{ ...base, importo: 40 }], selectedMonth: '2026-10', totalDue: 40 })
  assert.equal(result.monthlyPaid, 40)
  assert.equal(result.tokenPaid, 0)
  assert.equal(result.paid, 40)
}

// mensile + gettone: il ledger deve tenere separata la base insegnanti mensile dai gettoni
{
  const result = summarizeMonthlyTuitionPayments({
    payments: [
      { ...base, importo: 40 },
      { ...base, id: 'tok', tipo: 'gettone_corso', descrizione: 'A gettone · lezione singola', nova_package_type: 'gettone', nova_package_name: 'Gettone Lady', importo: 10 },
    ],
    selectedMonth: '2026-10',
    totalDue: 40,
  })
  assert.equal(result.monthlyPaid, 40)
  assert.equal(result.tokenPaid, 10)
  assert.equal(result.paid, 50)
  assert.equal(result.tokenBreakdown.length, 1)
  assert.equal(result.tokenBreakdown[0].amount, 10)
}

// trimestrale allocato mensilmente: la quota competenza resta l'importo del mese, non il totale pacchetto
{
  const result = summarizeMonthlyTuitionPayments({
    payments: [{ ...base, importo: 36.67, nova_package_name: 'Trimestrale · 1 corso', nova_package_type: 'trimestrale', nova_package_total: 110, nova_coverage_complete: true }],
    selectedMonth: '2026-10',
    totalDue: 40,
  })
  assert.equal(result.monthlyPaid, 36.67)
  assert.equal(result.status, 'pagato')
  assert.equal(result.residue, 0)
}

// omaggio: nessun compenso percentuale
{
  const result = summarizeMonthlyTuitionPayments({
    payments: [{ ...base, importo: 0, nova_package_name: 'Omaggio · 1 mese', nova_package_type: 'omaggio', nova_coverage_complete: true }],
    selectedMonth: '2026-10',
    totalDue: 40,
  })
  assert.equal(result.monthlyPaid, 0)
  assert.equal(result.status, 'omaggio')
}

console.log('paymentLedger teacher audit tests: OK')
