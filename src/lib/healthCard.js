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

const LETTER_POSITIONS = new Set([0, 1, 2, 3, 4, 5, 8, 11, 15])
const OCR_TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' }
const OCR_TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', J: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' }

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

function normalizeLine(value) {
  return String(value || '')
    .replace(/[|]/g, 'I')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
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

function looksLikeAnotherLabel(value, labels) {
  const candidate = upper(value)
  return labels.some((label) => candidate === label || candidate.startsWith(`${label} `) || candidate.startsWith(`${label}:`))
}

function cutAtNextLabel(value, labels) {
  const original = normalizeLine(value)
  const candidate = upper(original)
  let cut = original.length
  for (const label of labels) {
    const index = candidate.search(new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s:-])`))
    if (index >= 0) cut = Math.min(cut, index)
  }
  return normalizeLine(original.slice(0, cut))
}

function valueAroundLabel(lines, labels, rejectLabels = []) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = upper(lines[i])
    const label = labels.find((item) => labelIndex(line, item) >= 0)
    if (!label) continue
    const index = labelIndex(line, label)

    const sameLine = cutAtNextLabel(
      normalizeLine(lines[i].slice(index + label.length)).replace(/^[:\-\s]+/, ''),
      rejectLabels,
    )
    if (sameLine && sameLine.length >= 2 && !looksLikeAnotherLabel(sameLine, rejectLabels)) return sameLine

    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j += 1) {
      const next = cutAtNextLabel(normalizeLine(lines[j]), rejectLabels)
      if (!next || looksLikeAnotherLabel(next, rejectLabels)) continue
      return next
    }

    // Alcuni OCR restituiscono il valore appena prima dell'etichetta.
    for (let j = i - 1; j >= Math.max(0, i - 2); j -= 1) {
      const previous = normalizeLine(lines[j])
      if (!previous || looksLikeAnotherLabel(previous, rejectLabels)) continue
      return previous
    }
  }
  return ''
}

function cleanPersonName(value) {
  return titleCase(String(value || '')
    .replace(/\b(COGNOME|NOME|TESSERA|SANITARIA|REPUBBLICA|ITALIANA)\b/gi, ' ')
    .replace(/[^A-Za-zÀ-ÿ'’\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
}

function cleanBirthPlace(value) {
  return titleCase(String(value || '')
    .replace(/\b(PROVINCIA|PROV\.?|SESSO|DATA|NASCITA|LUOGO|SCADENZA|CODICE|FISCALE)\b.*$/i, '')
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

function repairFiscalCodeOcrCandidate(value) {
  const compact = normalizeFiscalCode(value)
  if (compact.length !== 16) return ''
  let result = ''

  for (let i = 0; i < compact.length; i += 1) {
    let char = compact[i]
    if (LETTER_POSITIONS.has(i)) {
      char = OCR_TO_LETTER[char] || char
      if (!/[A-Z]/.test(char)) return ''
    } else {
      char = OCR_TO_DIGIT[char] || char
      // Le posizioni numeriche possono contenere lettere per omocodia.
      if (!/[0-9LMNPQRSTUV]/.test(char)) return ''
    }
    result += char
  }

  if (!MONTHS[result[8]]) return ''
  return result
}

function extractFiscalCodeFromOcr(text) {
  const normalizedText = upper(text)
  const rawCandidates = new Set()

  // Prima cerca un CF già leggibile: evita falsi positivi generati dalle correzioni OCR.
  const exactTokens = normalizedText.match(/\b[A-Z]{6}[A-Z0-9]{2}[ABCDEHLMPRST][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]\b/g) || []
  const exactValid = exactTokens.find(validateFiscalCode)
  if (exactValid) return exactValid
  exactTokens.forEach((item) => rawCandidates.add(item))

  const directMatches = normalizedText.match(/[A-Z0-9][A-Z0-9\s._-]{14,26}[A-Z0-9]/g) || []
  for (const item of directMatches) {
    const compact = normalizeFiscalCode(item)
    if (compact.length === 16) rawCandidates.add(compact)
    for (let i = 0; i <= compact.length - 16; i += 1) rawCandidates.add(compact.slice(i, i + 16))
  }

  const compactAll = normalizeFiscalCode(normalizedText)
  for (let i = 0; i <= compactAll.length - 16; i += 1) rawCandidates.add(compactAll.slice(i, i + 16))

  const exact = [...rawCandidates].find(validateFiscalCode)
  if (exact) return exact

  for (const candidate of rawCandidates) {
    const repaired = repairFiscalCodeOcrCandidate(candidate)
    if (repaired && validateFiscalCode(repaired)) return repaired
  }

  return ''
}

function extractByJoinedLabel(joined, label, stopLabels) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stop = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const expression = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([\\s\\S]{2,80}?)(?=\\n?(?:${stop})\\b|$)`, 'i')
  const match = joined.match(expression)
  return normalizeLine(match?.[1] || '')
}

function chooseBirthDate(joined, dateRaw, cf) {
  const fromLabel = parseItalianDate(dateRaw)
  const cfDate = fiscalCodeDetails(cf)?.birthDate || ''
  if (fromLabel) return fromLabel

  const candidates = (joined.match(/\b[0-3]?\d[/.-][01]?\d[/.-](?:19|20)?\d{2}\b/g) || [])
    .map(parseItalianDate)
    .filter(Boolean)

  if (cfDate && candidates.includes(cfDate)) return cfDate
  if (cfDate) return cfDate
  // La prima data sul fronte è normalmente la data di nascita; la scadenza è più avanti.
  return candidates[0] || ''
}

export function parseHealthCardOcr(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean)
  const joined = lines.join('\n')
  const upperJoined = upper(joined)
  const allLabels = ['COGNOME', 'NOME', 'LUOGO DI NASCITA', 'LUOGO NASCITA', 'PROVINCIA', 'DATA DI NASCITA', 'DATA NASCITA', 'SESSO', 'CODICE FISCALE', 'SCADENZA']

  const cf = extractFiscalCodeFromOcr(joined)

  let surnameRaw = valueAroundLabel(lines, ['COGNOME'], allLabels.filter((label) => label !== 'COGNOME'))
  let nameRaw = valueAroundLabel(lines, ['NOME'], allLabels.filter((label) => label !== 'NOME'))
  let placeRaw = valueAroundLabel(lines, ['LUOGO DI NASCITA', 'LUOGO NASCITA'], ['PROVINCIA', 'DATA', 'SESSO', 'CODICE', 'SCADENZA'])
  let dateRaw = valueAroundLabel(lines, ['DATA DI NASCITA', 'DATA NASCITA'], ['SESSO', 'CODICE', 'SCADENZA'])
  const sexRaw = valueAroundLabel(lines, ['SESSO'], ['CODICE', 'SCADENZA'])

  // Fallback utile quando Tesseract mette etichetta e valore in un unico blocco.
  surnameRaw ||= extractByJoinedLabel(joined, 'COGNOME', ['NOME', 'LUOGO DI NASCITA', 'DATA DI NASCITA', 'SESSO', 'CODICE FISCALE'])
  nameRaw ||= extractByJoinedLabel(joined, 'NOME', ['LUOGO DI NASCITA', 'DATA DI NASCITA', 'SESSO', 'CODICE FISCALE'])
  placeRaw ||= extractByJoinedLabel(joined, 'LUOGO DI NASCITA', ['PROVINCIA', 'DATA DI NASCITA', 'SESSO', 'CODICE FISCALE'])
  dateRaw ||= extractByJoinedLabel(joined, 'DATA DI NASCITA', ['SESSO', 'CODICE FISCALE', 'SCADENZA'])

  const birthDate = chooseBirthDate(joined, dateRaw, cf)
  const cfDetails = fiscalCodeDetails(cf)
  let sex = upper(sexRaw).match(/\b[MF]\b/)?.[0] || ''
  if (!sex && cfDetails?.sex) sex = cfDetails.sex

  // Evita che stringhe istituzionali vengano scambiate per nome/cognome.
  const nome = cleanPersonName(nameRaw)
  const cognome = cleanPersonName(surnameRaw)
  const luogo = cleanBirthPlace(placeRaw)

  return {
    nome: /REPUBBLICA|TESSERA|SANITARIA/i.test(nome) ? '' : nome,
    cognome: /REPUBBLICA|TESSERA|SANITARIA/i.test(cognome) ? '' : cognome,
    cf: normalizeFiscalCode(cf),
    nascita: birthDate,
    luogo,
    sesso: sex,
    rawText: String(text || ''),
    debugText: upperJoined,
  }
}

export function healthCardOcrScore(parsed = {}) {
  return [parsed.nome, parsed.cognome, parsed.cf, parsed.nascita, parsed.luogo].filter(Boolean).length
}

export function mergeHealthCardOcrResults(first = {}, second = {}) {
  const choose = (key) => second[key] || first[key] || ''
  const merged = {
    nome: choose('nome'),
    cognome: choose('cognome'),
    cf: validateFiscalCode(second.cf) ? second.cf : (validateFiscalCode(first.cf) ? first.cf : choose('cf')),
    nascita: choose('nascita'),
    luogo: choose('luogo'),
    sesso: choose('sesso'),
    rawText: [first.rawText, second.rawText].filter(Boolean).join('\n---\n'),
  }

  // Se uno dei due risultati contiene un CF valido, la data ricavata dal CF è più affidabile dell'OCR.
  const details = fiscalCodeDetails(merged.cf)
  if (details?.birthDate) merged.nascita = details.birthDate
  if (details?.sex) merged.sesso = details.sex
  return merged
}

export async function preprocessHealthCardImage(file, { threshold = false, maxLongSide = 2300 } = {}) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }

  const longSide = Math.max(bitmap.width, bitmap.height)
  // Un leggero upscaling aiuta Tesseract sulle scritte piccole fotografate da smartphone.
  const ratio = longSide < 1700
    ? Math.min(2, 2100 / Math.max(1, longSide))
    : Math.min(1, maxLongSide / longSide)
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  let min = 255
  let max = 0

  for (let i = 0; i < data.length; i += 24) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    min = Math.min(min, lum)
    max = Math.max(max, lum)
  }

  const span = Math.max(42, max - min)
  for (let i = 0; i < data.length; i += 4) {
    let lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    lum = Math.max(0, Math.min(255, ((lum - min) * 255) / span))
    lum = Math.max(0, Math.min(255, (lum - 128) * 1.28 + 128))
    if (threshold) lum = lum > 154 ? 255 : 0
    data[i] = lum
    data[i + 1] = lum
    data[i + 2] = lum
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', threshold ? 0.96 : 0.92)
}
