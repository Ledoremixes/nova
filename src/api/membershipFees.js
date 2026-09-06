import { supabase } from './supabase'

const SECTION_KEY = 'corsisti'
const LIST_KEY = 'quota_tessera_assicurativa'

export const EVENT_MEMBERSHIP_FEE = 3
export const COURSE_MEMBERSHIP_FEE = 25

function parseValue(value) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function clampAmount(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(COURSE_MEMBERSHIP_FEE, Math.round(number * 100) / 100))
}

function normalizeRecord(row = {}) {
  const value = row._value || parseValue(row.value)
  return {
    id: row.id || null,
    tesseramento_id: String(value.tesseramento_id || row.label || ''),
    paid_amount: clampAmount(value.paid_amount),
    target_amount: COURSE_MEMBERSHIP_FEE,
    source: value.source || 'nova',
    updated_at: value.updated_at || row.created_at || null,
  }
}

export async function fetchMembershipFeeRecords() {
  const { data, error } = await supabase
    .from('lookup_options')
    .select('id,label,value,created_at')
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .limit(10000)

  if (error) throw new Error(error.message || 'Errore caricamento stato tessere assicurative')
  return (data || []).map(normalizeRecord)
}

export function resolveMembershipFeeState(student = {}, storedRecord = null) {
  let paidAmount = storedRecord ? clampAmount(storedRecord.paid_amount) : null
  let inferred = false

  if (paidAmount === null) {
    inferred = true
    const paymentStatus = String(student.payment_status || '').trim().toLowerCase()
    const basePaid = ['paid', 'pagato', 'active'].includes(paymentStatus)
    if (basePaid) {
      // Lo stato pagamento proveniente da Orchidea indica il tesseramento base della serata (€3).
      // La quota corsista da €25 viene considerata saldata solo quando Nova ha un record esplicito.
      paidAmount = EVENT_MEMBERSHIP_FEE
    } else {
      paidAmount = 0
    }
  }

  const remaining = Math.max(0, Math.round((COURSE_MEMBERSHIP_FEE - paidAmount) * 100) / 100)
  const status = remaining <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid'
  return {
    paid_amount: paidAmount,
    target_amount: COURSE_MEMBERSHIP_FEE,
    remaining,
    status,
    inferred,
    label: status === 'paid'
      ? 'Tessera corsista pagata'
      : status === 'partial'
        ? `Tesseramento serata pagato · mancano € ${remaining.toFixed(2).replace('.', ',')}`
        : 'Tessera corsista non pagata',
  }
}


async function fetchStoredMembershipFeeRecord(studentId) {
  if (!studentId) return null
  const { data, error } = await supabase
    .from('lookup_options')
    .select('id,label,value,created_at')
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .eq('label', String(studentId))
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message || 'Errore verifica quota tessera assicurativa')
  return data?.[0] ? normalizeRecord(data[0]) : null
}

export async function setMembershipFeePaidAmount({ studentId, paidAmount, source = 'manuale' }) {
  if (!studentId) throw new Error('Corsista non selezionato.')
  const cleanAmount = clampAmount(paidAmount)
  const payloadValue = JSON.stringify({
    schema: 1,
    tesseramento_id: String(studentId),
    paid_amount: cleanAmount,
    target_amount: COURSE_MEMBERSHIP_FEE,
    source,
    updated_at: new Date().toISOString(),
  })

  const existing = await supabase
    .from('lookup_options')
    .select('id')
    .eq('section_key', SECTION_KEY)
    .eq('list_key', LIST_KEY)
    .eq('label', String(studentId))
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing.error) throw new Error(existing.error.message || 'Errore verifica quota tessera assicurativa')

  if (existing.data?.[0]?.id) {
    const { data, error } = await supabase
      .from('lookup_options')
      .update({ value: payloadValue, is_active: true })
      .eq('id', existing.data[0].id)
      .select('id,label,value,created_at')
      .single()
    if (error) throw new Error(error.message || 'Errore aggiornamento quota tessera assicurativa')
    return normalizeRecord(data)
  }

  const { data, error } = await supabase
    .from('lookup_options')
    .insert([{
      user_id: null,
      section_key: SECTION_KEY,
      list_key: LIST_KEY,
      label: String(studentId),
      value: payloadValue,
      sort_order: 0,
      is_active: true,
    }])
    .select('id,label,value,created_at')
    .single()

  if (error) throw new Error(error.message || 'Errore salvataggio quota tessera assicurativa')
  return normalizeRecord(data)
}

export async function markConvertedCorsistaMembership(student = {}) {
  if (!student?.id || student.is_corsista) return null

  // Non sovrascrive mai una scelta già fatta dalla segreteria. È importante, per
  // esempio, quando un corsista da €25 viene temporaneamente rimosso e poi riattivato.
  const existing = await fetchStoredMembershipFeeRecord(student.id)
  if (existing) return existing

  const paymentStatus = String(student.payment_status || '').trim().toLowerCase()
  const basePaid = ['paid', 'pagato', 'active'].includes(paymentStatus)
  return setMembershipFeePaidAmount({
    studentId: student.id,
    paidAmount: basePaid ? EVENT_MEMBERSHIP_FEE : 0,
    source: basePaid ? 'conversione_da_tesserato_serata' : 'conversione_da_tesserato_non_pagato',
  })
}
