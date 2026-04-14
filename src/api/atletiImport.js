import { supabase } from './supabase'

function normalizeString(value) {
    return String(value ?? '').trim()
}

function normalizeEmail(value) {
    return normalizeString(value).toLowerCase()
}

function normalizePhone(value) {
    return normalizeString(value).replace(/\s+/g, '')
}

function normalizeCf(value) {
    return normalizeString(value).toUpperCase()
}

function normalizeBoolean(value) {
    const v = normalizeString(value).toLowerCase()
    return ['si', 'sì', 'yes', 'true', '1', 'ok'].includes(v)
}

function getRowValue(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
            return row[key]
        }
    }
    return ''
}

async function getCurrentUserId() {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error) throw error
    if (!user) throw new Error('Utente non autenticato')
    return user.id
}

async function findExistingTesserato({ userId, codFiscale }) {
    const cf = normalizeCf(codFiscale)

    if (!cf) {
        return null
    }

    const { data, error } = await supabase
        .from('tesserati')
        .select('id, nome, cognome, cod_fiscale, email, cellulare')
        .eq('user_id', userId)
        .eq('cod_fiscale', cf)

    if (error) throw error

    if ((data ?? []).length > 1) {
        throw new Error(`Duplicato tesserati: codice fiscale ${cf} presente più volte`)
    }

    return (data ?? [])[0] ?? null
}

async function createTesserato({ userId, nome, cognome, codFiscale, email, cellulare }) {
    const { data, error } = await supabase
        .from('tesserati')
        .insert([
            {
                user_id: userId,
                nome: normalizeString(nome),
                cognome: normalizeString(cognome),
                cod_fiscale: normalizeCf(codFiscale) || null,
                email: normalizeEmail(email) || null,
                cellulare: normalizePhone(cellulare) || null,
            },
        ])
        .select('id, nome, cognome, cod_fiscale, email, cellulare')
        .single()

    if (error) throw error
    return data
}

async function findExistingAtleta({ tesseratoId }) {
    const { data, error } = await supabase
        .from('atleti')
        .select('id, tesserato_id')
        .eq('tesserato_id', tesseratoId)
        .maybeSingle()

    if (error) throw error
    return data
}

async function createAtleta({
    userId,
    tesseratoId,
    gruppoLookupId,
    certificatoMedicoPresente,
    note,
}) {
    const { data, error } = await supabase
        .from('atleti')
        .insert([
            {
                user_id: userId,
                tesserato_id: tesseratoId,
                gruppo_lookup_id: gruppoLookupId || null,
                certificato_medico_presente: !!certificatoMedicoPresente,
                note: note || null,
                is_active: true,
            },
        ])
        .select('id')
        .single()

    if (error) throw error
    return data
}

async function updateAtletaIfNeeded({
    atletaId,
    gruppoLookupId,
    certificatoMedicoPresente,
    note,
}) {
    const { error } = await supabase
        .from('atleti')
        .update({
            gruppo_lookup_id: gruppoLookupId || null,
            certificato_medico_presente: !!certificatoMedicoPresente,
            note: note || null,
            is_active: true,
        })
        .eq('id', atletaId)

    if (error) throw error
}

function normalizeLookupValue(value) {
    return normalizeString(value)
        .toLowerCase()
        .replace(/\s+/g, ' ')
}

async function findOrCreateCorsoLookup({ userId, label }) {
    const cleanLabel = normalizeString(label)
    if (!cleanLabel) return null

    const { data, error } = await supabase
        .from('lookup_options')
        .select('id, label')
        .eq('user_id', userId)
        .eq('section_key', 'sport')
        .eq('list_key', 'corsi')

    if (error) throw error

    const match = (data ?? []).find(
        (item) => normalizeLookupValue(item.label) === normalizeLookupValue(cleanLabel)
    )

    if (match) return match

    const { data: created, error: createError } = await supabase
        .from('lookup_options')
        .insert([
            {
                user_id: userId,
                section_key: 'sport',
                list_key: 'corsi',
                label: cleanLabel,
                value: cleanLabel,
                sort_order: 0,
                is_active: true,
            },
        ])
        .select('id, label')
        .single()

    if (createError) throw createError
    return created
}

async function findOrCreateLivelloLookup({ userId, label }) {
    const cleanLabel = normalizeString(label)
    if (!cleanLabel) return null

    const { data, error } = await supabase
        .from('lookup_options')
        .select('id, label')
        .eq('user_id', userId)
        .eq('section_key', 'sport')
        .eq('list_key', 'livelli_corso')

    if (error) throw error

    const match = (data ?? []).find(
        (item) => normalizeLookupValue(item.label) === normalizeLookupValue(cleanLabel)
    )

    if (match) return match

    const { data: created, error: createError } = await supabase
        .from('lookup_options')
        .insert([
            {
                user_id: userId,
                section_key: 'sport',
                list_key: 'livelli_corso',
                label: cleanLabel,
                value: cleanLabel,
                sort_order: 0,
                is_active: true,
            },
        ])
        .select('id, label')
        .single()

    if (createError) throw createError
    return created
}

async function findExistingAtletaCorsi(atletaId) {
    const { data, error } = await supabase
        .from('atleta_corsi')
        .select('id, corso_lookup_id, livello_lookup_id')
        .eq('atleta_id', atletaId)

    if (error) throw error
    return data ?? []
}

async function createAtletaCorso({
    userId,
    atletaId,
    corsoLookupId,
    livelloLookupId,
    note,
}) {
    const { data, error } = await supabase
        .from('atleta_corsi')
        .insert([
            {
                user_id: userId,
                atleta_id: atletaId,
                corso_lookup_id: corsoLookupId,
                livello_lookup_id: livelloLookupId || null,
                note: note || null,
                is_active: true,
            },
        ])
        .select('id')
        .single()

    if (error) throw error
    return data
}

function parseCourseEntries(rawCourseText) {
  const text = normalizeString(rawCourseText)
  if (!text) return []

  const parts = text
    .split(/\s+e\s+/i)
    .map((part) => normalizeString(part))
    .filter(Boolean)

  const knownLevels = ['base', 'intermedio', 'avanzato', 'open']

  return parts.map((part) => {
    let livelloLabel = ''
    let corsoLabel = part

    for (const level of knownLevels) {
      const regex = new RegExp(`\\b${level}\\b`, 'i')
      if (regex.test(part)) {
        livelloLabel = level.charAt(0).toUpperCase() + level.slice(1)
        corsoLabel = normalizeString(part.replace(regex, ''))
        break
      }
    }

    return {
      corsoLabel: corsoLabel || part,
      livelloLabel,
    }
  })
}

export function mapImportedAthleteRows(rawRows) {
    return rawRows
        .map((row, index) => {
            const corso = getRowValue(row, ['CORSO', 'Corso', 'corso'])
            const nome = getRowValue(row, ['NOME', 'Nome', 'nome'])
            const cognome = getRowValue(row, ['COGNOME', 'Cognome', 'cognome'])
            const codFiscale = getRowValue(row, ['CF', 'Codice Fiscale', 'CODICE FISCALE'])
            const numero = getRowValue(row, ['NUMERO', 'Numero', 'Telefono', 'Cellulare'])
            const mail = getRowValue(row, ['MAIL', 'Mail', 'Email', 'E-mail'])
            const certificatoMedico = getRowValue(row, [
                'CERTIFICATO MEDICO',
                'Certificato medico',
                'certificato medico',
            ])
            const assicurazione = getRowValue(row, [
                'ASSICURAZIONE 25/26',
                'Assicurazione 25/26',
                'ASSICURAZIONE',
            ])
            const metodo = getRowValue(row, ['METODO', 'Metodo', 'metodo'])

            return {
                rowNumber: index + 2,
                courseEntries: parseCourseEntries(corso),
                nome: normalizeString(nome),
                cognome: normalizeString(cognome),
                codFiscale: normalizeCf(codFiscale),
                cellulare: normalizePhone(numero),
                email: normalizeEmail(mail),
                certificatoMedicoPresente: normalizeBoolean(certificatoMedico),
                assicurazione: normalizeString(assicurazione),
                metodo: normalizeString(metodo),
                raw: row,
            }
        })
        .filter((row) => row.nome || row.cognome || row.codFiscale || row.email)
}

export async function importAthletesRows(rows, options = {}) {
    const userId = await getCurrentUserId()
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null

    const result = {
        totalRows: rows.length,
        processedRows: 0,
        importedAthletes: 0,
        updatedAthletes: 0,
        createdTesserati: 0,
        skippedRows: 0,
        errors: [],
    }

    const knownLookupIds = new Set()
    const createdLookupIds = new Set()

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]

        try {
            if (!row.nome || !row.cognome) {
                result.skippedRows += 1
                result.processedRows += 1

                onProgress?.({
                    current: result.processedRows,
                    total: result.totalRows,
                    percent: result.totalRows ? Math.round((result.processedRows / result.totalRows) * 100) : 0,
                    rowNumber: row.rowNumber,
                    status: 'skipped',
                    message: 'Riga saltata: nome o cognome mancanti.',
                })

                result.errors.push({
                    rowNumber: row.rowNumber,
                    message: 'Riga saltata: nome o cognome mancanti.',
                })
                continue
            }

            let tesserato = await findExistingTesserato({
                userId,
                codFiscale: row.codFiscale,
            })

            if (!tesserato) {
                tesserato = await createTesserato({
                    userId,
                    nome: row.nome,
                    cognome: row.cognome,
                    codFiscale: row.codFiscale,
                    email: row.email,
                    cellulare: row.cellulare,
                })
                result.createdTesserati += 1
            }

            const existingAtleta = await findExistingAtleta({
                tesseratoId: tesserato.id,
            })

            const note = [
                row.assicurazione ? `Assicurazione: ${row.assicurazione}` : '',
                row.metodo ? `Metodo dal file: ${row.metodo}` : '',
            ]
                .filter(Boolean)
                .join(' | ')

            let atletaId = null

            if (existingAtleta) {
                await updateAtletaIfNeeded({
                    atletaId: existingAtleta.id,
                    gruppoLookupId: null,
                    certificatoMedicoPresente: row.certificatoMedicoPresente,
                    note,
                })
                result.updatedAthletes += 1
                atletaId = existingAtleta.id
            } else {
                const createdAtleta = await createAtleta({
                    userId,
                    tesseratoId: tesserato.id,
                    gruppoLookupId: null,
                    certificatoMedicoPresente: row.certificatoMedicoPresente,
                    note,
                })
                result.importedAthletes += 1
                atletaId = createdAtleta.id
            }

            if (atletaId && row.courseEntries?.length) {
                const existingAssignments = await findExistingAtletaCorsi(atletaId)
                const existingKeys = new Set(
                    existingAssignments.map(
                        (item) => `${item.corso_lookup_id}::${item.livello_lookup_id || ''}`
                    )
                )

                for (const entry of row.courseEntries) {
                    const corsoLookup = await findOrCreateCorsoLookup({
                        userId,
                        label: entry.corsoLabel,
                    })

                    const livelloLookup = entry.livelloLabel
                        ? await findOrCreateLivelloLookup({
                            userId,
                            label: entry.livelloLabel,
                        })
                        : null

                    const key = `${corsoLookup?.id || ''}::${livelloLookup?.id || ''}`

                    if (corsoLookup?.id && !existingKeys.has(key)) {
                        await createAtletaCorso({
                            userId,
                            atletaId,
                            corsoLookupId: corsoLookup.id,
                            livelloLookupId: livelloLookup?.id || null,
                            note: null,
                        })

                        existingKeys.add(key)
                    }
                }
            }

            result.processedRows += 1

            onProgress?.({
                current: result.processedRows,
                total: result.totalRows,
                percent: result.totalRows ? Math.round((result.processedRows / result.totalRows) * 100) : 0,
                rowNumber: row.rowNumber,
                status: existingAtleta ? 'updated' : 'created',
                message: existingAtleta
                    ? `Atleta aggiornato: ${row.nome} ${row.cognome}`
                    : `Atleta creato: ${row.nome} ${row.cognome}`,
            })
        } catch (error) {
            result.processedRows += 1

            onProgress?.({
                current: result.processedRows,
                total: result.totalRows,
                percent: result.totalRows ? Math.round((result.processedRows / result.totalRows) * 100) : 0,
                rowNumber: row.rowNumber,
                status: 'error',
                message: error.message || 'Errore sconosciuto durante import.',
            })

            result.errors.push({
                rowNumber: row.rowNumber,
                message: error.message || 'Errore sconosciuto durante import.',
            })
        }
    }

    return result
}