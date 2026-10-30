// Codici dei ruoli storici: restano leggibili anche prima della configurazione su Conti.
export const LEGACY_VOLUNTEER_ROLES = [
  { value: 'barman', label: 'Barman' },
  { value: 'cameriere', label: 'Cameriere' },
  { value: 'barlady', label: 'Barlady' },
  { value: 'ballerino', label: 'Ballerino' },
  { value: 'animatore', label: 'Animatore' },
  { value: 'videomaker', label: 'Videomaker' },
  { value: 'fotografo', label: 'Fotografo' },
]

export function volunteerRoleCode(label) {
  return String(label || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 70)
}

export function prettyVolunteerRole(value) {
  const text = String(value || '').replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Ruolo non specificato'
}

// La lista configurata in Conti prevale sui ruoli legacy. I codici già salvati nelle
// schede rimangono consultabili anche se la voce viene disattivata o eliminata.
export function getVolunteerRoleOptions(lookups = [], savedCodes = []) {
  const configured = lookups.filter((item) => item?.value && item?.label)
  const source = configured.length
    ? configured.map((item) => ({ value: String(item.value), label: String(item.label), isActive: item.is_active !== false }))
    : LEGACY_VOLUNTEER_ROLES.map((item) => ({ ...item, isActive: true }))
  const result = []
  const existing = new Set()
  for (const item of source) {
    if (!existing.has(item.value)) { result.push(item); existing.add(item.value) }
  }
  for (const code of savedCodes.filter(Boolean)) {
    if (!existing.has(code)) {
      const legacy = LEGACY_VOLUNTEER_ROLES.find((item) => item.value === code)
      result.push({ value: code, label: legacy?.label || prettyVolunteerRole(code), isActive: false })
      existing.add(code)
    }
  }
  return result
}
