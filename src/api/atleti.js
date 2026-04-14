import { supabase } from './supabase'

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  if (!user) throw new Error('Utente non autenticato')
  return user.id
}

export async function fetchAtleti() {
  const { data, error } = await supabase
    .from('atleti')
    .select(`
      id,
      user_id,
      tesserato_id,
      numero_tessera,
      scadenza_tessera,
      certificato_medico_presente,
      scadenza_visita_medica,
      note,
      is_active,
      created_at,
      tesserato:tesserati (
        id,
        nome,
        cognome,
        data_nascita,
        cod_fiscale,
        cellulare,
        indirizzo,
        citta,
        email
      ),
      corsi:atleta_corsi (
        id,
        corso_lookup_id,
        livello_lookup_id,
        note,
        corso:lookup_options!atleta_corsi_corso_lookup_id_fkey (
          id,
          label,
          value
        ),
        livello:lookup_options!atleta_corsi_livello_lookup_id_fkey (
          id,
          label,
          value
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchTesseratiForAthletes() {
  const { data, error } = await supabase
    .from('tesserati')
    .select('id, nome, cognome, cellulare, email')
    .order('cognome', { ascending: true })
    .order('nome', { ascending: true })

  if (error) throw error
  return data ?? []
}


export async function createAtletaFromExistingTesserato(payload) {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase
    .from('atleti')
    .insert([
      {
        user_id: userId,
        tesserato_id: payload.tesserato_id,
        gruppo_lookup_id: payload.gruppo_lookup_id || null,
        numero_tessera: payload.numero_tessera?.trim() || null,
        scadenza_tessera: payload.scadenza_tessera || null,
        certificato_medico_presente: !!payload.certificato_medico_presente,
        scadenza_visita_medica: payload.scadenza_visita_medica || null,
        note: payload.note?.trim() || null,
        is_active: payload.is_active !== false,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createAtletaWithNewTesserato(payload) {
  const userId = await getCurrentUserId()

  const { data: tesserato, error: tesseratoError } = await supabase
    .from('tesserati')
    .insert([
      {
        user_id: userId,
        nome: payload.nome.trim(),
        cognome: payload.cognome.trim(),
        data_nascita: payload.data_nascita || null,
        cod_fiscale: payload.cod_fiscale?.trim() || null,
        cellulare: payload.cellulare?.trim() || null,
        indirizzo: payload.indirizzo?.trim() || null,
        citta: payload.citta?.trim() || null,
        email: payload.email?.trim() || null,
      },
    ])
    .select()
    .single()

  if (tesseratoError) throw tesseratoError

  const { data: atleta, error: atletaError } = await supabase
    .from('atleti')
    .insert([
      {
        user_id: userId,
        tesserato_id: tesserato.id,
        gruppo_lookup_id: payload.gruppo_lookup_id || null,
        numero_tessera: payload.numero_tessera?.trim() || null,
        scadenza_tessera: payload.scadenza_tessera || null,
        certificato_medico_presente: !!payload.certificato_medico_presente,
        scadenza_visita_medica: payload.scadenza_visita_medica || null,
        note: payload.note?.trim() || null,
        is_active: payload.is_active !== false,
      },
    ])
    .select()
    .single()

  if (atletaError) throw atletaError
  return atleta
}

export async function updateAtleta(id, payload) {
  const { data, error } = await supabase
    .from('atleti')
    .update({
      gruppo_lookup_id: payload.gruppo_lookup_id || null,
      numero_tessera: payload.numero_tessera?.trim() || null,
      scadenza_tessera: payload.scadenza_tessera || null,
      certificato_medico_presente: !!payload.certificato_medico_presente,
      scadenza_visita_medica: payload.scadenza_visita_medica || null,
      note: payload.note?.trim() || null,
      is_active: payload.is_active !== false,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  if (payload.tesserato_id) {
    const { error: tesseratoError } = await supabase
      .from('tesserati')
      .update({
        nome: payload.nome?.trim() || null,
        cognome: payload.cognome?.trim() || null,
        data_nascita: payload.data_nascita || null,
        cod_fiscale: payload.cod_fiscale?.trim() || null,
        cellulare: payload.cellulare?.trim() || null,
        indirizzo: payload.indirizzo?.trim() || null,
        citta: payload.citta?.trim() || null,
        email: payload.email?.trim() || null,
      })
      .eq('id', payload.tesserato_id)

    if (tesseratoError) throw tesseratoError
  }

  return data
}

export async function deleteAtleta(id) {
  const { error } = await supabase
    .from('atleti')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}