import { supabase } from './supabase'

export async function fetchGroups(userId) {
    const { data, error } = await supabase
        .from('gruppi')
        .select(`
      *,
      atleti_gruppi (
        id,
        atleta_id
      )
    `)
        .eq('user_id', userId)
        .order('attivo', { ascending: false })
        .order('nome', { ascending: true })

    if (error) {
        console.error('Errore fetch gruppi:', error)
        throw new Error(error.message || 'Errore nel caricamento dei gruppi')
    }

    return data ?? []
}

export async function createGroup(payload) {
    const { data, error } = await supabase
        .from('gruppi')
        .insert([payload])
        .select()
        .single()

    if (error) {
        console.error('Errore create gruppo:', error)
        throw new Error(error.message || 'Errore nella creazione del gruppo')
    }

    return data
}

export async function updateGroup(id, payload) {
    const { data, error } = await supabase
        .from('gruppi')
        .update({
            ...payload,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Errore update gruppo:', error)
        throw new Error(error.message || 'Errore nella modifica del gruppo')
    }

    return data
}

export async function deleteGroup(id) {
    const { error } = await supabase
        .from('gruppi')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Errore delete gruppo:', error)
        throw new Error(error.message || 'Errore nell’eliminazione del gruppo')
    }

    return true
}

export async function fetchAthletesForGroup(userId, gruppoId) {
    const { data, error } = await supabase
        .from('atleti')
        .select(`
      id,
      tesserato_id,
      gruppo_id,
      numero_tessera,
      tesserati (
        id,
        nome,
        cognome,
        cod_fiscale,
        cellulare,
        email
      )
    `)
        .eq('user_id', userId)
        .eq('gruppo_id', gruppoId)

    if (error) {
        console.error('Errore fetch iscritti gruppo:', error)
        throw new Error(error.message || 'Errore nel caricamento degli iscritti del gruppo')
    }

    return data ?? []
}

export async function fetchAvailableAthletes(userId) {
    const { data, error } = await supabase
        .from('tesserati')
        .select('id, nome, cognome, cod_fiscale, cellulare, email')
        .eq('user_id', userId)
        .order('cognome', { ascending: true })
        .order('nome', { ascending: true })

    if (error) {
        console.error('Errore fetch atleti:', error)
        throw new Error(error.message || 'Errore nel caricamento degli atleti')
    }

    return data ?? []
}

export async function addAthleteToGroup(payload) {
    const { data, error } = await supabase
        .from('atleti')
        .insert([payload])
        .select()
        .single()

    if (error) {
        console.error('Errore aggiunta atleta al gruppo:', error)

        if (
            error.message?.includes('duplicate key value') ||
            error.code === '23505'
        ) {
            throw new Error('Questo atleta è già associato a questo gruppo.')
        }

        throw new Error(error.message || 'Errore nell’aggiunta atleta al gruppo')
    }

    return data
}

export async function removeAthleteFromGroup(linkId) {
    const { error } = await supabase
        .from('atleti')
        .delete()
        .eq('id', linkId)

    if (error) {
        console.error('Errore rimozione atleta dal gruppo:', error)
        throw new Error(error.message || 'Errore nella rimozione atleta dal gruppo')
    }

    return true
}