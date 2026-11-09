// Regole definite dagli amministratori in Conti > Regole per descrizione.
// Usiamo lookup_options esistente: value = testo da cercare, report_area = natura,
// report_row_code = codice conto, sort_order = priorita'. Nessun dato viene
// classificato con un'ipotesi fiscale non configurata dall'operatore.
export function normalizeMatchText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function findDescriptionRule(description, rules = []) {
  const haystack = normalizeMatchText(description)
  if (!haystack) return null

  const ordered = (rules || [])
    .filter((rule) => rule?.is_active !== false)
    .filter((rule) => ['istituzionale', 'commerciale'].includes(rule?.report_area))
    .filter((rule) => String(rule?.report_row_code || '').trim())
    .map((rule) => ({
      ...rule,
      term: normalizeMatchText(rule.value),
    }))
    .filter((rule) => rule.term.length >= 3)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || b.term.length - a.term.length)

  return ordered.find((rule) => haystack.includes(rule.term)) || null
}

export function applyDescriptionRule(row, rules = [], { overwrite = false } = {}) {
  // I movimenti di tesoreria non diventano mai commerciali per parole nella descrizione.
  if (String(row?.nature || '').toLowerCase() === 'trasferimento' ||
      String(row?.source || '').toLowerCase() === 'trasferimento interno' ||
      String(row?.account_code || '').toUpperCase() === 'GIRO') return row
  const rule = findDescriptionRule(row?.description, rules)
  if (!rule) return row
  return {
    ...row,
    account_code: (overwrite || !row.account_code) ? String(rule.report_row_code).trim() : row.account_code,
    nature: (overwrite || !row.nature) ? rule.report_area : row.nature,
  }
}
