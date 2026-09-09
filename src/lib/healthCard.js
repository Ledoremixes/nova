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
  return unique.find(validateFiscalCode) || unique.find((candidate) => /^[A-Z]{6}[A-Z0-9]{2}[ABCDEHLMPRST][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/.test(candidate)) || ''
}

function normalizeLine(value) {
  return String(value || '')
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
}

function upper(value) {
  return normalizeLine(value).toUpperCase()
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, lead, char) => `${lead}${char.toUpperCase()}`)
    .trim()
}

function labelIndex(line, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = line.match(new RegExp(`(?:^|\\s)${escaped}(?=$|[\\s:-])`))
  if (!match) return -1
  return (match.index || 0) + match[0].length - label.length
}

function valueAfterLabel(lines, labels, rejectLabels = []) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = upper(lines[i])
    const label = labels.find((item) => labelIndex(line, item) >= 0)
    if (!label) continue
    const index = labelIndex(line, label)

    const sameLine = normalizeLine(lines[i].slice(index + label.length)).replace(/^[:\-\s]+/, '')
    if (sameLine && sameLine.length >= 2 && !rejectLabels.some((item) => upper(sameLine).includes(item))) return sameLine

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j += 1) {
      const next = normalizeLine(lines[j])
      const nextUpper = upper(next)
      if (!next || rejectLabels.some((item) => nextUpper.includes(item))) continue
      return next
    }
  }
  return ''
}

function cleanPersonName(value) {
  return titleCase(String(value || '').replace(/[^A-Za-zÀ-ÿ'’\-\s]/g, ' ').replace(/\s+/g, ' ').trim())
}

function cleanBirthPlace(value) {
  return titleCase(String(value || '')
    .replace(/\b(PROVINCIA|PROV\.?|SESSO|DATA|NASCITA|LUOGO)\b.*$/i, '')
    .replace(/[^A-Za-zÀ-ÿ'’\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
}

function parseItalianDate(value) {
  const match = String(value || '').match(/\b([0-3]?\d)[/.-]([01]?\d)[/.-]((?:19|20)?\d{2})\b/)
  if (!match) return ''
  let year = match[3]
  if (year.length === 2) {
    const yy = Number(year)
    const current = new Date().getFullYear() % 100
    year = String(yy > current ? 1900 + yy : 2000 + yy)
  }
  const month = Number(match[2])
  const day = Number(match[1])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseHealthCardOcr(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean)
  const joined = lines.join('\n')
  const allLabels = ['COGNOME', 'NOME', 'LUOGO DI NASCITA', 'DATA DI NASCITA', 'SESSO', 'CODICE FISCALE', 'SCADENZA']

  const cfMatches = upper(joined).match(/[A-Z]{6}[A-Z0-9]{2}[ABCDEHLMPRST][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]/g) || []
  const cf = cfMatches.find(validateFiscalCode) || cfMatches[0] || ''

  const surnameRaw = valueAfterLabel(lines, ['COGNOME'], allLabels.filter((label) => label !== 'COGNOME'))
  const nameRaw = valueAfterLabel(lines, ['NOME'], allLabels.filter((label) => label !== 'NOME'))
  const placeRaw = valueAfterLabel(lines, ['LUOGO DI NASCITA', 'LUOGO NASCITA'], ['DATA', 'SESSO', 'CODICE', 'SCADENZA'])
  const dateRaw = valueAfterLabel(lines, ['DATA DI NASCITA', 'DATA NASCITA'], ['SESSO', 'CODICE', 'SCADENZA'])
  const sexRaw = valueAfterLabel(lines, ['SESSO'], ['CODICE', 'SCADENZA'])

  let birthDate = parseItalianDate(dateRaw)
  if (!birthDate) {
    const dateCandidates = joined.match(/\b[0-3]?\d[/.-][01]?\d[/.-](?:19|20)?\d{2}\b/g) || []
    birthDate = dateCandidates.map(parseItalianDate).find(Boolean) || ''
  }

  const cfDetails = fiscalCodeDetails(cf)
  if (!birthDate && cfDetails?.birthDate) birthDate = cfDetails.birthDate

  let sex = upper(sexRaw).match(/\b[MF]\b/)?.[0] || ''
  if (!sex && cfDetails?.sex) sex = cfDetails.sex

  return {
    nome: cleanPersonName(nameRaw),
    cognome: cleanPersonName(surnameRaw),
    cf: normalizeFiscalCode(cf),
    nascita: birthDate,
    luogo: cleanBirthPlace(placeRaw),
    sesso: sex,
    rawText: String(text || ''),
  }
}

export async function preprocessHealthCardImage(file, { threshold = false } = {}) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const maxLongSide = 1900
  const ratio = Math.min(1, maxLongSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  let min = 255
  let max = 0

  for (let i = 0; i < data.length; i += 16) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    min = Math.min(min, lum)
    max = Math.max(max, lum)
  }

  const span = Math.max(36, max - min)
  for (let i = 0; i < data.length; i += 4) {
    let lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    lum = Math.max(0, Math.min(255, ((lum - min) * 255) / span))
    lum = Math.max(0, Math.min(255, (lum - 128) * 1.22 + 128))
    if (threshold) lum = lum > 157 ? 255 : 0
    data[i] = lum
    data[i + 1] = lum
    data[i + 2] = lum
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}
