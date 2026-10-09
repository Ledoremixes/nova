const MONTH_BY_CODE = {
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

const OMOCODIA_DIGITS = {
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

export const OPES_HEADERS = [
  'Classe tesseramento',
  'Tipo tesseramento',
  'Data Inizio',
  'Data Fine',
  'Discipline',
  'Matricola',
  'Nazione cittadinanza',
  'Codice Fiscale',
  'Cognome',
  'Nome',
  'Data di nascita',
  'Sesso',
  'Nazione nascita',
  'Comune di nascita',
]

export const OPES_DEFAULTS = {
  membershipClass: 'A',
  membershipType: 'APR',
  startDate: '09/10/2026',
  endDate: '31/08/2027',
  discipline: 'BC006',
}

function cleanFiscalCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function decodeCfDigit(value) {
  const char = String(value || '').toUpperCase()
  if (/\d/.test(char)) return char
  return OMOCODIA_DIGITS[char] ?? ''
}

function twoDigitNumber(first, second) {
  const decoded = `${decodeCfDigit(first)}${decodeCfDigit(second)}`
  if (!/^\d{2}$/.test(decoded)) return null
  return Number(decoded)
}

function resolveBirthYear(twoDigitYear, now = new Date()) {
  const currentYear = now.getFullYear()
  const currentTwoDigits = currentYear % 100
  return twoDigitYear <= currentTwoDigits ? 2000 + twoDigitYear : 1900 + twoDigitYear
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function parseBirthInfoFromFiscalCode(value, now = new Date()) {
  const cf = cleanFiscalCode(value)
  if (!/^[A-Z0-9]{16}$/.test(cf)) {
    return { valid: false, cf, birthDate: '', sex: '', reason: 'Codice fiscale non valido' }
  }

  const year = twoDigitNumber(cf[6], cf[7])
  const month = MONTH_BY_CODE[cf[8]]
  const rawDay = twoDigitNumber(cf[9], cf[10])

  if (year === null || !month || rawDay === null) {
    return { valid: false, cf, birthDate: '', sex: '', reason: 'Data di nascita non decodificabile dal codice fiscale' }
  }

  const sex = rawDay > 40 ? 'F' : 'M'
  const day = sex === 'F' ? rawDay - 40 : rawDay
  const fullYear = resolveBirthYear(year, now)
  const parsed = new Date(Date.UTC(fullYear, month - 1, day))
  const isRealDate =
    parsed.getUTCFullYear() === fullYear &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day

  if (!isRealDate || day < 1) {
    return { valid: false, cf, birthDate: '', sex: '', reason: 'Data di nascita non valida nel codice fiscale' }
  }

  return {
    valid: true,
    cf,
    birthDate: `${pad2(day)}/${pad2(month)}/${fullYear}`,
    sex,
    reason: '',
  }
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildOpesRows(students, options = {}) {
  const config = { ...OPES_DEFAULTS, ...options }
  const seenFiscalCodes = new Set()
  const rows = []
  const skipped = []

  for (const student of students || []) {
    const parsed = parseBirthInfoFromFiscalCode(student?.cf)
    const name = String(student?.nome || '').trim()
    const surname = String(student?.cognome || '').trim()

    if (!parsed.valid) {
      skipped.push({ student, reason: parsed.reason })
      continue
    }

    if (seenFiscalCodes.has(parsed.cf)) continue
    seenFiscalCodes.add(parsed.cf)

    rows.push([
      config.membershipClass,
      config.membershipType,
      config.startDate,
      config.endDate,
      config.discipline,
      '',
      '',
      parsed.cf,
      surname,
      name,
      parsed.birthDate,
      parsed.sex,
      '',
      '',
    ])
  }

  return { rows, skipped }
}

export function buildOpesCsv(students, options = {}) {
  const { rows, skipped } = buildOpesRows(students, options)
  const content = [OPES_HEADERS, ...rows]
    .map((row) => row.map(csvEscape).join(';'))
    .join('\r\n')

  return {
    csv: `\uFEFF${content}\r\n`,
    exportedCount: rows.length,
    skipped,
  }
}
