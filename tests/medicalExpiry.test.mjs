import assert from 'node:assert/strict'
import { annualMedicalExpiry } from '../src/utils/medicalExpiry.js'

assert.equal(annualMedicalExpiry('2026-10-29'), '2027-10-29')
assert.equal(annualMedicalExpiry('2028-02-29'), '2029-02-28')
assert.equal(annualMedicalExpiry('2027-02-28'), '2028-02-28')
assert.equal(annualMedicalExpiry('2026-12-31'), '2027-12-31')
assert.equal(annualMedicalExpiry(''), '')
assert.equal(annualMedicalExpiry('2026-02-30'), '')
console.log('OK: calcolo scadenza annuale visite mediche')
