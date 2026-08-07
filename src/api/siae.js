import { supabase } from './supabase'

export const SIAE_EVENT_PRESETS = {
  caraibica: {
    label: 'Serata caraibica',
    title: 'SERATA CARAIBICA - BACHATA E SALSA',
    time: '22:30',
  },
  country: {
    label: 'Serata Country',
    title: 'SERATA COUNTRY',
    time: '21:00',
  },
  kizomba: {
    label: 'Pomeriggio Social Kizomba',
    title: 'POMERIGGIO SOCIAL KIZOMBA',
    time: '15:00',
  },
  custom: {
    label: 'Altro evento',
    title: '',
    time: '22:30',
  },
}

export const SIAE_DEFAULTS = {
  organizer_name: 'CLUB ORCHIDEA ASD',
  organizer_tax_code: '14275140961',
  system_holder: 'MANUEL LEDONNE',
  venue_name: 'CLUB ORCHIDEA ASD',
  municipality: 'SARONNO',
  province: 'VA',
  event_type_code: 'BALLO SM SM61',
  siae_office: 'CESANO MADERNO',
  sector_code: 'UN',
  ticket_type_code: 'I',
  unit_price: 10,
  vat_rate: 22,
  entertainment_rate: 16,
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function calculateSiaeAmounts(admissions, unitPrice) {
  const tickets = Math.max(0, Math.trunc(Number(admissions || 0)))
  const price = Math.max(0, Number(unitPrice || 0))
  const gross = roundMoney(tickets * price)
  const divisor = 1 + (SIAE_DEFAULTS.vat_rate + SIAE_DEFAULTS.entertainment_rate) / 100
  const rawTaxable = gross / divisor

  return {
    admissions: tickets,
    unit_price: roundMoney(price),
    gross_amount: gross,
    taxable_amount: roundMoney(rawTaxable),
    entertainment_tax: roundMoney(rawTaxable * (SIAE_DEFAULTS.entertainment_rate / 100)),
    vat_amount: roundMoney(rawTaxable * (SIAE_DEFAULTS.vat_rate / 100)),
    vat_rate: SIAE_DEFAULTS.vat_rate,
    entertainment_rate: SIAE_DEFAULTS.entertainment_rate,
  }
}

function normalize(row = {}) {
  return {
    ...row,
    admissions: Number(row.admissions || 0),
    unit_price: Number(row.unit_price || 0),
    gross_amount: Number(row.gross_amount || 0),
    taxable_amount: Number(row.taxable_amount || 0),
    entertainment_tax: Number(row.entertainment_tax || 0),
    vat_amount: Number(row.vat_amount || 0),
    vat_rate: Number(row.vat_rate || SIAE_DEFAULTS.vat_rate),
    entertainment_rate: Number(row.entertainment_rate || SIAE_DEFAULTS.entertainment_rate),
    cancelled_tickets: Number(row.cancelled_tickets || 0),
  }
}

function preparePayload(input = {}) {
  const preset = SIAE_EVENT_PRESETS[input.event_kind] || SIAE_EVENT_PRESETS.caraibica
  const amounts = calculateSiaeAmounts(input.admissions, input.unit_price)
  const title = input.event_kind === 'custom'
    ? String(input.event_title || '').trim().toUpperCase()
    : preset.title

  return {
    event_date: input.event_date,
    event_time: input.event_time || preset.time,
    event_kind: input.event_kind || 'caraibica',
    event_title: title,
    ...amounts,
    organizer_name: input.organizer_name || SIAE_DEFAULTS.organizer_name,
    organizer_tax_code: input.organizer_tax_code || SIAE_DEFAULTS.organizer_tax_code,
    system_holder: input.system_holder || SIAE_DEFAULTS.system_holder,
    venue_name: input.venue_name || SIAE_DEFAULTS.venue_name,
    municipality: input.municipality || SIAE_DEFAULTS.municipality,
    province: input.province || SIAE_DEFAULTS.province,
    event_type_code: input.event_type_code || SIAE_DEFAULTS.event_type_code,
    siae_office: input.siae_office || SIAE_DEFAULTS.siae_office,
    sector_code: input.sector_code || SIAE_DEFAULTS.sector_code,
    ticket_type_code: input.ticket_type_code || SIAE_DEFAULTS.ticket_type_code,
    local_code: input.local_code || null,
    capacity: input.capacity ? Number(input.capacity) : null,
    cancelled_tickets: Math.max(0, Math.trunc(Number(input.cancelled_tickets || 0))),
    notes: String(input.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export async function fetchSiaeEvents() {
  const { data, error } = await supabase
    .from('siae_c1_events')
    .select('*')
    .order('event_date', { ascending: false })
    .order('event_time', { ascending: false })

  if (error) throw error
  return (data || []).map(normalize)
}

export async function createSiaeEvent(input) {
  const payload = preparePayload(input)
  const { data, error } = await supabase
    .from('siae_c1_events')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return normalize(data)
}

export async function updateSiaeEvent(id, input) {
  const payload = preparePayload(input)
  const { data, error } = await supabase
    .from('siae_c1_events')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return normalize(data)
}

export async function deleteSiaeEvent(id) {
  const { error } = await supabase.from('siae_c1_events').delete().eq('id', id)
  if (error) throw error
  return true
}
