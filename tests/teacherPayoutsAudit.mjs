import assert from 'node:assert/strict'
import { buildTeacherMonthlyPayouts } from '../src/lib/teacherPayouts.js'

const laura = { id: 't-laura', full_name: 'Laura', payment_type: 'percentuale', percentage_compensation: 20 }
const manuel = { id: 't-manuel', full_name: 'Manuel', payment_type: 'percentuale', percentage_compensation: 20 }

const lady = {
  id: 'lady', nome: 'Lady Style', prezzo_mensile: 40,
  teachers: [{ id: 't-laura', full_name: 'Laura', course_percentage_compensation: 40 }],
}
const bachata = {
  id: 'bachata', nome: 'Bachata Base', prezzo_mensile: 40,
  teachers: [{ id: 't-laura', full_name: 'Laura', course_percentage_compensation: 20 }, { id: 't-manuel', full_name: 'Manuel', course_percentage_compensation: 20 }],
}
const salsa = {
  id: 'salsa', nome: 'Salsa Base', prezzo_mensile: 40,
  teachers: [{ id: 't-laura', full_name: 'Laura', course_percentage_compensation: 20 }, { id: 't-manuel', full_name: 'Manuel', course_percentage_compensation: 20 }],
}

function payment({ id, student, courses, monthly, membership = 0, tokens = [], allocationIds = [] }) {
  return {
    id,
    pagamento_id: id,
    tesseramento_id: student,
    nomeCompleto: student,
    corsi: courses,
    pagato: monthly + membership + tokens.reduce((sum, item) => sum + item.amount, 0),
    membership_fee_charged: membership,
    monthly_tuition_paid: monthly,
    token_paid: tokens.reduce((sum, item) => sum + item.amount, 0),
    token_breakdown: tokens,
    teacher_allocation_course_ids: allocationIds,
  }
}

// 9 corsisti Lady Style singolo corso: 9 * 40 * 40% = 144
{
  const rows = Array.from({ length: 9 }, (_, i) => payment({ id: `l${i}`, student: `S${i}`, courses: [lady], monthly: 40 }))
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady], paymentRows: rows, month: '2026-10' })
  assert.equal(payout.total, 144)
  assert.equal(payout.attributed_tuition, 360)
}

// Pacchetto 2 corsi da 60: quota per corso 30; Laura prende 40% Lady + 20% Bachata = 18 totali
{
  const rows = [payment({ id: 'm1', student: 'A', courses: [lady, bachata], monthly: 60 })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady, bachata], paymentRows: rows, month: '2026-10' })
  assert.equal(payout.total, 18)
  const ladyRow = payout.rows.find((row) => row.course_id === undefined ? row.course_name === 'Lady Style' : row.course_id === 'lady')
  assert.equal(Math.round(ladyRow.student_quota * 100), 3000)
  assert.equal(Math.round(ladyRow.teacher_quota * 100), 1200)
}

// Tessera non entra nel compenso
{
  const rows = [payment({ id: 'm2', student: 'B', courses: [lady], monthly: 40, membership: 25 })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady], paymentRows: rows, month: '2026-10' })
  assert.equal(payout.total, 16)
}

// Pagamento parziale: 20 * 40% = 8
{
  const rows = [payment({ id: 'm3', student: 'C', courses: [lady], monthly: 20 })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady], paymentRows: rows, month: '2026-10' })
  assert.equal(payout.total, 8)
}

// Pagamento mensile + gettone specifico Lady: entrambi attribuiti correttamente senza doppio conteggio
{
  const rows = [payment({
    id: 'm4', student: 'D', courses: [lady, bachata], monthly: 60,
    tokens: [{ id: 'tok1', amount: 10, packageName: 'Gettone Lady', course_ids: ['lady'] }],
  })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady, bachata], paymentRows: rows, month: '2026-10' })
  // mensile: 30*40% + 30*20% = 18; gettone Lady 10*40%=4
  assert.equal(payout.total, 22)
  assert.equal(payout.attributed_tuition, 70)
}

// Pacchetto personalizzato associato solo a Lady: non deve essere spalmato su Bachata
{
  const rows = [payment({ id: 'm5', student: 'E', courses: [lady, bachata], monthly: 35, allocationIds: ['lady'] })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady, bachata], paymentRows: rows, month: '2026-10' })
  assert.equal(payout.total, 14)
  assert.equal(payout.rows.length, 1)
  assert.equal(payout.rows[0].course_name, 'Lady Style')
}

// Percentuale specifica Lady 40%, percentuale generale 20% sugli altri corsi
{
  const rows = [payment({ id: 'm6', student: 'F', courses: [lady, bachata, salsa], monthly: 85 })]
  const [payout] = buildTeacherMonthlyPayouts({ teachers: [laura], courses: [lady, bachata, salsa], paymentRows: rows, month: '2026-10' })
  const ladyQuota = payout.rows.find((row) => row.course_name === 'Lady Style')
  const bachataQuota = payout.rows.find((row) => row.course_name === 'Bachata Base')
  assert.equal(ladyQuota.percentuale_insegnante, 40)
  assert.equal(bachataQuota.percentuale_insegnante, 20)
  assert.equal(Math.round(payout.attributed_tuition * 100), 8500)
}

console.log('teacherPayouts audit tests: OK')
