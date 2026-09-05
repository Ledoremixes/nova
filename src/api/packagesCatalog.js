import { supabase } from './supabase'

function normalizePackage(row = {}) {
  return {
    id: row.id,
    nome: row.nome || 'Pacchetto',
    tipo: row.tipo || 'mensile',
    durata_mesi: Math.max(1, Number(row.durata_mesi || 1)),
    prezzo: Math.max(0, Number(row.prezzo || 0)),
    descrizione: row.descrizione || '',
    attivo: row.attivo !== false,
    ordine: Number(row.ordine || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

export async function fetchPackagesCatalog({ includeInactive = true } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessione operatore Nova non disponibile.')
  const response = await fetch(`/api/packages-catalog?includeInactive=${includeInactive ? 'true' : 'false'}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error || 'Errore caricamento pacchetti'
    if (String(message).toLowerCase().includes('nova_packages_catalog')) {
      throw new Error('Catalogo pacchetti non ancora installato. Esegui packages_and_payment_coverage.sql nel database Orchidea Allievi.')
    }
    throw new Error(message)
  }
  return (payload || []).map(normalizePackage)
}

async function packageWrite(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessione operatore Nova non disponibile.')
  const response = await fetch('/api/packages-catalog', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Errore salvataggio pacchetto')
  return payload
}

export async function createPackageCatalog(payload) {
  const row = {
    nome: String(payload.nome || '').trim(),
    tipo: payload.tipo || 'mensile',
    durata_mesi: Math.max(1, Number(payload.durata_mesi || 1)),
    prezzo: Math.max(0, Number(payload.prezzo || 0)),
    descrizione: String(payload.descrizione || '').trim() || null,
    attivo: payload.attivo !== false,
    ordine: Number(payload.ordine || 0),
  }
  if (!row.nome) throw new Error('Inserisci il nome del pacchetto.')
  return normalizePackage(await packageWrite('POST', row))
}

export async function updatePackageCatalog(id, payload) {
  const row = {
    id,
    nome: String(payload.nome || '').trim(),
    tipo: payload.tipo || 'mensile',
    durata_mesi: Math.max(1, Number(payload.durata_mesi || 1)),
    prezzo: Math.max(0, Number(payload.prezzo || 0)),
    descrizione: String(payload.descrizione || '').trim() || null,
    attivo: payload.attivo !== false,
    ordine: Number(payload.ordine || 0),
  }
  if (!row.nome) throw new Error('Inserisci il nome del pacchetto.')
  return normalizePackage(await packageWrite('PATCH', row))
}

export async function deletePackageCatalog(id) {
  await packageWrite('DELETE', { id })
  return true
}

