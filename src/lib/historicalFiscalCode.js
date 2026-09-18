// Validation for the historical import only. This checks the formal structure
// and control character, including omocodia; it cannot prove an assigned identity.
export function normalizeHistoricalCf(value) {
  return String(value ?? '').trim().replace(/\s+/g, '').toUpperCase()
}

const ODD_VALUES = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}
const OMOCODIA_DIGITS = 'LMNPQRSTUV'

export function isValidHistoricalCf(value) {
  const cf = normalizeHistoricalCf(value)
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
    return false
  }

  const day = Number(cf.slice(9, 11).replace(/[LMNPQRSTUV]/g, (char) => String(OMOCODIA_DIGITS.indexOf(char))))
  if (!(day >= 1 && day <= 31) && !(day >= 41 && day <= 71)) return false

  let total = 0
  for (let index = 0; index < 15; index += 1) {
    const char = cf[index]
    total += index % 2 === 0
      ? ODD_VALUES[char]
      : char.charCodeAt(0) - (/\d/.test(char) ? 48 : 65)
  }
  return cf[15] === String.fromCharCode(65 + (total % 26))
}

export function splitHistoricalRecords(records) {
  const eligible = []
  const excluded = []
  for (const record of records) {
    if (isValidHistoricalCf(record?.cf)) eligible.push(record)
    else excluded.push(record)
  }
  return { eligible, excluded }
}
