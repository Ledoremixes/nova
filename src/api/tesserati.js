import { supabase } from './supabase'

export async function fetchTesserati({ search = '', anno = '', tipo = '' }) {
  let query = supabase
    .from('tesserati')
    .select('*')
    .order('created_at', { ascending: false })

  if (anno) {
    query = query.eq('anno', anno)
  }

  if (tipo) {
    query = query.eq('tipo', tipo)
  }

  if (search.trim()) {
    const q = search.trim()
    query = query.or(
      `nome.ilike.%${q}%,cognome.ilike.%${q}%,email.ilike.%${q}%,cod_fiscale.ilike.%${q}%,cellulare.ilike.%${q}%`
    )
  }

  const { data, error } = await query

  if (error) throw new Error(error.message || 'Errore caricamento tesserati')
  return data || []
}

export async function createTesserato(payload) {
  const { data, error } = await supabase
    .from('tesserati')
    .insert([payload])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore creazione tesserato')
  return data
}

export async function updateTesserato(id, payload) {
  const { data, error } = await supabase
    .from('tesserati')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Errore modifica tesserato')
  return data
}

export async function deleteTesserato(id) {
  const { error } = await supabase
    .from('tesserati')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message || 'Errore eliminazione tesserato')
}