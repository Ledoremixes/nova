// Nova is the only authority for teacher payouts.
// Aggregate Nova's existing computed rows before sending the snapshot:
// no student names or personal payment details are sent to the teacher app.
const moneyCents = value => Math.round((Number(value) || 0) * 100)

export function buildNovaTeacherPayoutSync(payouts = []) {
  return payouts.map(payout => {
    const grouped = new Map()
    for (const row of payout.rows || []) {
      const name = String(row.course_name || 'Corso')
      const level = String(row.course_level || '')
      const key = JSON.stringify([name, level])
      if (!grouped.has(key)) {
        grouped.set(key, { corso_nome: name, corso_livello: level, rawCompenso: 0,
          rawIncasso: 0, students: new Set(), aliquota: null, method: null, mixed: false })
      }
      const target = grouped.get(key)
      target.rawCompenso += Number(row.teacher_quota || 0)
      target.rawIncasso += Math.max(0, Number(row.student_quota || 0))
      if (row.student_name) target.students.add(row.student_name)
      const rate = Number.isFinite(Number(row.percentuale_insegnante))
        && row.percentuale_insegnante !== null && row.percentuale_insegnante !== undefined
        ? Number(row.percentuale_insegnante) : null
      const method = String(row.source || 'percentuale')
      if (target.method !== null && (target.method !== method || target.aliquota !== rate)) {
        target.mixed = true
      }
      target.method = method
      target.aliquota = rate
    }
    const items = [...grouped.values()]
    const totalCents = moneyCents(payout.total)
    let assignedCents = 0
    const breakdown = items.map((row, index) => {
      const cents = index === items.length - 1 ? totalCents - assignedCents : moneyCents(row.rawCompenso)
      assignedCents += cents
      return {
        corso_nome: row.corso_nome,
        corso_livello: row.corso_livello,
        compenso: cents / 100,
        incasso_attribuito: moneyCents(row.rawIncasso) / 100,
        aliquota: row.mixed ? null : row.aliquota,
        metodo_compenso: row.mixed ? 'misto' : row.method,
        corsisti_paganti: row.students.size,
      }
    })
    if (breakdown.some(row => row.compenso < 0)) {
      throw new Error('Errore arrotondamento compensi Nova.')
    }
    return {
      teacher_id: payout.teacher_id,
      total: totalCents / 100,
      breakdown,
    }
  })
}

export async function syncNovaTeacherPayouts({ month, payouts, supabase }) {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Sessione Nova non disponibile.')
  const response = await fetch('/api/orchidea-teacher-compensations', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ month, payouts: buildNovaTeacherPayoutSync(payouts) }),
  })
  let body
  try { body = await response.json() } catch { body = {} }
  if (!response.ok || body?.ok !== true) {
    throw new Error(body?.error || 'Sincronizzazione compensi Nova non riuscita.')
  }
  return body
}
