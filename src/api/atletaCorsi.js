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

export async function fetchAtletaCorsi(atletaId) {
  const { data, error } = await supabase
    .from('atleta_corsi')
    .select(`
      id,
      atleta_id,
      corso_lookup_id,
      livello_lookup_id,
      note,
      is_active,
      created_at,
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
    `)
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function replaceAtletaCorsi(atletaId, rows) {
  const userId = await getCurrentUserId()

  const uniqueMap = new Map()

  for (const row of rows ?? []) {
    const corsoId = row.corso_lookup_id || ''
    const livelloId = row.livello_lookup_id || ''
    if (!corsoId) continue

    const key = `${corsoId}::${livelloId}`
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        user_id: userId,
        atleta_id: atletaId,
        corso_lookup_id: corsoId,
        livello_lookup_id: livelloId || null,
        note: row.note?.trim() || null,
        is_active: row.is_active !== false,
      })
    }
  }

  const cleanedRows = Array.from(uniqueMap.values())

  const { error: deleteError } = await supabase
    .from('atleta_corsi')
    .delete()
    .eq('atleta_id', atletaId)

  if (deleteError) throw deleteError

  if (!cleanedRows.length) return []

  const { data, error } = await supabase
    .from('atleta_corsi')
    .insert(cleanedRows)
    .select(`
      id,
      atleta_id,
      corso_lookup_id,
      livello_lookup_id,
      note,
      is_active,
      created_at
    `)

  if (error) throw error
  return data ?? []
}