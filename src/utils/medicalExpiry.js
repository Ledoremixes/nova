// Solo date YYYY-MM-DD, senza conversioni di fuso orario.
// Il 29 febbraio scade il 28 febbraio dell'anno successivo.
export function annualMedicalExpiry(issuedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt || '')) return ''
  const [year, month, day] = issuedAt.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  const targetYear = year + 1
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}
