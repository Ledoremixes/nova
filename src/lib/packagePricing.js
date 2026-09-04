import dayjs from 'dayjs'

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function monthStartDate(month) {
  const value = String(month || dayjs().format('YYYY-MM')).slice(0, 7)
  return `${value}-01`
}

export function monthEndDate(month) {
  return dayjs(monthStartDate(month)).endOf('month').format('YYYY-MM-DD')
}

export function enrollmentIsActiveForMonth(row = {}, month) {
  const startOfMonth = monthStartDate(month)
  const endOfMonth = monthEndDate(month)
  const state = String(row.stato || row.status || '').trim().toLowerCase()

  if (['annullato', 'rimosso', 'cancellato', 'inactive', 'non_attivo'].includes(state)) return false
  if (row.rinnovo_attivo === false) return false

  const start = row.data_inizio || row.data_iscrizione || row.created_at || null
  const end = row.data_fine || row.scadenza || null

  if (start && String(start).slice(0, 10) > endOfMonth) return false
  if (end && String(end).slice(0, 10) < startOfMonth) return false
  return true
}

export function latestPricingForEnrollment(history = [], enrollmentId, month) {
  const cutoff = monthEndDate(month)
  const key = String(enrollmentId || '')

  return history
    .filter((item) => String(item.enrollment_id || '') === key)
    .filter((item) => item.effective_from && String(item.effective_from).slice(0, 10) <= cutoff)
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)) || Number(b.id || 0) - Number(a.id || 0))[0] || null
}

export function resolveEnrollmentPricing(row = {}, history = [], month, course = {}) {
  const version = latestPricingForEnrollment(history, row.id, month)

  return {
    ...row,
    quota_allievo_mensile: numberOrNull(version?.quota_allievo_mensile) ?? numberOrNull(row.quota_allievo_mensile) ?? numberOrNull(row.tariffa_mensile) ?? numberOrNull(course.prezzo_mensile) ?? numberOrNull(course.prezzo) ?? 0,
    tariffa_mensile: numberOrNull(version?.quota_allievo_mensile) ?? numberOrNull(row.tariffa_mensile) ?? numberOrNull(row.quota_allievo_mensile) ?? numberOrNull(course.prezzo_mensile) ?? numberOrNull(course.prezzo) ?? 0,
    pacchetto_nome: version?.pacchetto_nome ?? row.pacchetto_nome ?? null,
    pacchetto_totale_mensile: numberOrNull(version?.pacchetto_totale_mensile) ?? numberOrNull(row.pacchetto_totale_mensile),
    note_pacchetto: version?.note_pacchetto ?? row.note_pacchetto ?? null,
    pricing_effective_from: version?.effective_from || null,
    pricing_history_id: version?.id || null,
  }
}

export function distributeTotalByOriginalPrice(rows = [], totalValue = 0) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const total = Math.max(0, Number(totalValue || 0))
  const weights = rows.map((row) => Math.max(0, Number(row.prezzo_corso || row.corsi?.prezzo_mensile || row.corsi?.prezzo || 0)))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const safeWeights = weightTotal > 0 ? weights : rows.map(() => 1)
  const safeWeightTotal = weightTotal > 0 ? weightTotal : rows.length

  const rawShares = rows.map((_, index) => total * safeWeights[index] / safeWeightTotal)
  const cents = rawShares.map((value) => Math.floor((value + Number.EPSILON) * 100))
  let missingCents = Math.round(total * 100) - cents.reduce((sum, value) => sum + value, 0)

  const order = rawShares
    .map((value, index) => ({ index, fraction: value * 100 - Math.floor(value * 100) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  let pointer = 0
  while (missingCents > 0 && order.length > 0) {
    cents[order[pointer % order.length].index] += 1
    missingCents -= 1
    pointer += 1
  }

  return rows.map((row, index) => ({
    ...row,
    quota_allievo_mensile: (cents[index] / 100).toFixed(2),
  }))
}
