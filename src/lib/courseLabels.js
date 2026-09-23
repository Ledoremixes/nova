function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizedDay(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.toLocaleLowerCase('it-IT')
}

export function courseDisplayName(course = {}) {
  const fallback = course.nome || course.name || course.titolo || 'Corso'
  const text = normalize([
    course.nome,
    course.name,
    course.titolo,
    course.disciplina,
    course.tipo,
    course.livello,
  ].filter(Boolean).join(' '))
  const day = normalizedDay(course.giorno_settimana || course.giorno)

  // In Nova esistono due corsi distinti di Country base, appartenenti a
  // insegnanti diversi. Il giorno fa parte dell'etichetta operativa così la
  // segreteria non può confonderli durante iscrizioni, pagamenti e pacchetti.
  if (/\bcountry\b/.test(text) && /\b(base|basic|principiant[ei]|primi passi)\b/.test(text) && day) {
    return `Country base ${day}`
  }

  return fallback
}

export function courseDisplaySubtitle(course = {}) {
  return [course.livello, course.giorno_settimana || course.giorno, course.ora_inizio]
    .filter(Boolean)
    .join(' · ') || course.disciplina || 'Corso Orchidea'
}
