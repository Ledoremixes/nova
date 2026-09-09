const MONTHS = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  H: 6,
  L: 7,
  M: 8,
  P: 9,
  R: 10,
  S: 11,
  T: 12,
}

const OMOCODIA_TO_DIGIT = {
  L: '0',
  M: '1',
  N: '2',
  P: '3',
  Q: '4',
  R: '5',
  S: '6',
  T: '7',
  U: '8',
  V: '9',
}

const ODD_VALUES = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}

const EVEN_VALUES = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
}

export function normalizeFiscalCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function decodeNumericPair(value) {
  return String(value || '').split('').map((char) => OMOCODIA_TO_DIGIT[char] ?? char).join('')
}

export function validateFiscalCode(value) {
  const cf = normalizeFiscalCode(value)
  if (!/^[A-Z]{6}[A-Z0-9]{2}[ABCDEHLMPRST][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/.test(cf)) return false

  let sum = 0
  for (let i = 0; i < 15; i += 1) {
    const char = cf[i]
    const position = i + 1
    sum += position % 2 === 1 ? (ODD_VALUES[char] ?? -999) : (EVEN_VALUES[char] ?? -999)
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15]
}

export function fiscalCodeDetails(value) {
  const cf = normalizeFiscalCode(value)
  if (cf.length !== 16) return null

  const yearPart = Number(decodeNumericPair(cf.slice(6, 8)))
  const month = MONTHS[cf[8]]
  const dayCode = Number(decodeNumericPair(cf.slice(9, 11)))
  if (!Number.isFinite(yearPart) || !month || !Number.isFinite(dayCode)) return null

  const female = dayCode > 40
  const day = female ? dayCode - 40 : dayCode
  if (day < 1 || day > 31) return null

  const currentTwoDigits = new Date().getFullYear() % 100
  const year = yearPart > currentTwoDigits ? 1900 + yearPart : 2000 + yearPart
  const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return {
    cf,
    birthDate,
    sex: female ? 'F' : 'M',
    birthplaceCode: `${cf[11]}${decodeNumericPair(cf.slice(12, 15))}`,
    valid: validateFiscalCode(cf),
  }
}

export function fiscalCodeFromBarcode(rawValue) {
  const compact = normalizeFiscalCode(rawValue)
  const candidates = []
  if (compact.length === 16) candidates.push(compact)

  for (let start = 0; start <= compact.length - 16; start += 1) {
    candidates.push(compact.slice(start, start + 16))
  }

  const unique = [...new Set(candidates)]
  return unique.find(validateFiscalCode)
    || unique.find((candidate) => /^[A-Z]{6}[A-Z0-9]{2}[ABCDEHLMPRST][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/.test(candidate))
    || ''
}
