function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function asAmount(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

function matchesMonthValue(value, selectedMonth) {
  const raw = text(value)
  if (!raw) return false
  if (raw.slice(0, 7) === selectedMonth) return true

  const months = {
    gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
    luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
  }
  const named = lower(raw).match(/(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/)
  if (named) return `${named[2]}-${months[named[1]]}` === selectedMonth

  const date = new Date(raw)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 7) === selectedMonth
}

/**
 * La competenza del pagamento ha priorità sulla data di incasso.
 * In questo modo una quota di giugno incassata a luglio resta attribuita a giugno.
 */
export function paymentMatchesAccountingMonth(row = {}, selectedMonth) {
  const competenceValues = [row.periodo, row.mese, row.scadenza, row.competenza].filter(Boolean)
  if (competenceValues.length) return competenceValues.some((value) => matchesMonthValue(value, selectedMonth))

  return [row.data_pagamento, row.pagato_il, row.created_at]
    .filter(Boolean)
    .some((value) => matchesMonthValue(value, selectedMonth))
}

export function isCanonicalMonthlyPayment(row = {}) {
  const type = lower(row.tipo || row.type || row.categoria)
  const description = lower(row.descrizione || row.description || row.causale)
  return type === 'quota_mensile' || type === 'quota mensile' || description.startsWith('quota mensile ')
}

function isTuitionPayment(row = {}) {
  const type = lower(row.tipo || row.type || row.categoria)
  const description = lower(row.descrizione || row.description || row.causale)
  const excluded = ['associativ', 'tesser', 'visita', 'certificat', 'evento', 'serata', 'shop']
  if (excluded.some((token) => type.includes(token) || description.includes(token))) return false
  if (isCanonicalMonthlyPayment(row)) return true
  if (['corso', 'quota corso', 'mensile', 'pacchetto'].some((token) => type.includes(token) || description.includes(token))) return true

  // Compatibilità con i vecchi record Orchidea: pagamento legato all'allievo e a un periodo.
  return Boolean((row.tesseramento_id || row.allievo_id || row.student_id) && (row.periodo || row.mese))
}

function paymentTimestamp(row = {}) {
  const value = row.updated_at || row.data_pagamento || row.pagato_il || row.created_at || row.scadenza || ''
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function isPaidState(row = {}) {
  return ['pagato', 'paid', 'coperto', 'parziale', 'partial'].includes(lower(row.stato || row.status))
}

function isPausedState(row = {}) {
  return ['sospeso', 'chiuso', 'paused', 'closed'].includes(lower(row.stato || row.status))
}

/**
 * Restituisce un solo saldo autorevole per allievo/mese.
 * Se esiste il record Nova `quota_mensile`, quello più recente prevale sui vecchi
 * record per-corso e impedisce somme duplicate (es. 70 € che diventano 112 €).
 */
export function summarizeMonthlyTuitionPayments({ payments = [], selectedMonth, totalDue = 0 }) {
  const due = asAmount(totalDue)
  const relevant = payments
    .filter((row) => paymentMatchesAccountingMonth(row, selectedMonth))
    .filter(isTuitionPayment)

  const canonicalRows = relevant
    .filter(isCanonicalMonthlyPayment)
    .sort((a, b) => paymentTimestamp(b) - paymentTimestamp(a))

  const authoritative = canonicalRows[0] || null
  let rawPaid = 0
  let paused = false
  let source = 'none'

  if (authoritative) {
    source = 'nova'
    paused = isPausedState(authoritative)
    rawPaid = isPaidState(authoritative) && !paused
      ? asAmount(authoritative.importo ?? authoritative.amount)
      : 0
  } else {
    source = relevant.length ? 'legacy' : 'none'
    paused = relevant.some(isPausedState)
    rawPaid = relevant.reduce((sum, item) => (
      isPaidState(item) && !isPausedState(item)
        ? sum + asAmount(item.importo ?? item.amount)
        : sum
    ), 0)
  }

  // Una quota corso non può risultare incassata oltre il dovuto: l'eccedenza
  // dei vecchi duplicati viene tracciata ma non altera saldo e compensi.
  const paid = due > 0 ? Math.min(rawPaid, due) : rawPaid
  const calculatedResidue = Math.max(due - paid, 0)
  let status = 'da_pagare'
  if (paused) status = 'sospeso'
  else if (due > 0 && paid >= due) status = 'pagato'
  else if (paid > 0) status = 'parziale'
  const residue = paused ? 0 : calculatedResidue

  return {
    paid,
    rawPaid,
    residue,
    status,
    source,
    authoritative,
    relevantCount: relevant.length,
    duplicateCount: Math.max(canonicalRows.length - 1, 0),
    legacyCount: relevant.length - canonicalRows.length,
    ignoredExcess: Math.max(rawPaid - paid, 0),
    method: authoritative?.metodo || authoritative?.method || '',
    note: authoritative?.note || '',
    paidAt: authoritative?.data_pagamento || authoritative?.pagato_il || null,
    updatedAt: authoritative?.updated_at || authoritative?.created_at || null,
  }
}
