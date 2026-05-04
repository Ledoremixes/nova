import { supabase } from './supabase'

function getPersonFromAthleteRow(row) {
    return row?.tesserato || row?.tesserati || null
}

function normalizeAvailableAthlete(row) {
    const person = getPersonFromAthleteRow(row)

    return {
        id: row.id, // IMPORTANTISSIMO: questo è atleti.id, NON tesserati.id
        atleta_id: row.id,
        tesserato_id: row.tesserato_id,
        numero_tessera: row.numero_tessera,
        is_active: row.is_active,
        tesserati: person,

        // campi flat per non dover riscrivere tutta GruppiPage
        nome: person?.nome ?? '',
        cognome: person?.cognome ?? '',
        cod_fiscale: person?.cod_fiscale ?? '',
        cellulare: person?.cellulare ?? '',
        email: person?.email ?? '',
    }
}

function normalizeGroupAthleteLink(row) {
    const atleta = row.atleta || row.atleti || null
    const person = getPersonFromAthleteRow(atleta)

    return {
        id: row.id, // id della tabella ponte atleti_gruppi
        gruppo_id: row.gruppo_id,
        atleta_id: row.atleta_id,
        tesserato_id: atleta?.tesserato_id ?? person?.id ?? null,
        numero_tessera: atleta?.numero_tessera ?? null,
        atleta,
        tesserati: person,

        // campi flat opzionali
        nome: person?.nome ?? '',
        cognome: person?.cognome ?? '',
        cod_fiscale: person?.cod_fiscale ?? '',
        cellulare: person?.cellulare ?? '',
        email: person?.email ?? '',
    }
}

function sortByName(list) {
    return [...list].sort((a, b) => {
        const aName = `${a.cognome || ''} ${a.nome || ''}`.trim().toLowerCase()
        const bName = `${b.cognome || ''} ${b.nome || ''}`.trim().toLowerCase()
        return aName.localeCompare(bName, 'it')
    })
}

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
        .from('atleti_gruppi')
        .select(`
            id,
            gruppo_id,
            atleta_id,
            atleta:atleti (
                id,
                user_id,
                tesserato_id,
                numero_tessera,
                is_active,
                tesserato:tesserati (
                    id,
                    nome,
                    cognome,
                    cod_fiscale,
                    cellulare,
                    email
                )
            )
        `)
        .eq('gruppo_id', gruppoId)

    if (error) {
        console.error('Errore fetch iscritti gruppo:', error)
        throw new Error(error.message || 'Errore nel caricamento degli iscritti del gruppo')
    }

    const rows = (data ?? [])
        .filter((row) => row.atleta?.user_id === userId)
        .map(normalizeGroupAthleteLink)

    return sortByName(rows)
}

export async function fetchAvailableAthletes(userId) {
    const { data, error } = await supabase
        .from('atleti')
        .select(`
            id,
            user_id,
            tesserato_id,
            numero_tessera,
            is_active,
            tesserato:tesserati (
                id,
                nome,
                cognome,
                cod_fiscale,
                cellulare,
                email
            )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Errore fetch atleti:', error)
        throw new Error(error.message || 'Errore nel caricamento degli atleti')
    }

    return sortByName((data ?? []).map(normalizeAvailableAthlete))
}

export async function addAthleteToGroup(payload) {
    if (!payload?.gruppo_id || !payload?.atleta_id) {
        throw new Error('Dati mancanti: gruppo o atleta non valido.')
    }

    const { data: existing, error: existingError } = await supabase
        .from('atleti_gruppi')
        .select('id')
        .eq('gruppo_id', payload.gruppo_id)
        .eq('atleta_id', payload.atleta_id)
        .maybeSingle()

    if (existingError) {
        console.error('Errore controllo atleta già nel gruppo:', existingError)
        throw new Error(existingError.message || 'Errore nel controllo iscrizione atleta.')
    }

    if (existing) {
        throw new Error('Questo atleta è già associato a questo gruppo.')
    }

    const basePayload = {
        gruppo_id: payload.gruppo_id,
        atleta_id: payload.atleta_id,
    }

    const payloadWithUser = payload.user_id
        ? {
            ...basePayload,
            user_id: payload.user_id,
        }
        : basePayload

    let { data, error } = await supabase
        .from('atleti_gruppi')
        .insert([payloadWithUser])
        .select('id, gruppo_id, atleta_id')
        .single()

    // Fallback nel caso in cui atleti_gruppi NON abbia la colonna user_id
    if (
        error &&
        (
            error.code === 'PGRST204' ||
            error.message?.toLowerCase().includes('user_id')
        )
    ) {
        const retry = await supabase
            .from('atleti_gruppi')
            .insert([basePayload])
            .select('id, gruppo_id, atleta_id')
            .single()

        data = retry.data
        error = retry.error
    }

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
        .from('atleti_gruppi')
        .delete()
        .eq('id', linkId)

    if (error) {
        console.error('Errore rimozione atleta dal gruppo:', error)
        throw new Error(error.message || 'Errore nella rimozione atleta dal gruppo')
    }

    return true
}