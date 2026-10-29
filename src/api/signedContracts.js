import { supabase } from './supabase'

// Conservazione dei contratti firmati nell'archivio riservato di Nova.
// Le anagrafiche degli insegnanti possono provenire dal DB Orchidea: usiamo
// il tipo, la tabella di origine e l'ID per evitare collisioni tra record.
const BUCKET = 'nova-signed-contracts'
const MAX_BYTES = 10 * 1024 * 1024
const MIME_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function staffKey({ kind, source, id }) {
  if (!['teacher', 'volunteer'].includes(kind) || !source || id === null || id === undefined || id === '') {
    throw new Error('Scheda collaboratore non valida.')
  }
  if (kind === 'volunteer' && source !== 'sport_volunteers') throw new Error('Origine volontario non valida.')
  if (kind === 'teacher' && !['insegnanti', 'teachers', 'teachers_nova'].includes(source)) {
    throw new Error('Origine insegnante non valida.')
  }
  return { staff_kind: kind, staff_source: source, staff_id: String(id) }
}

export function validateSignedContractFile(file) {
  if (!file) throw new Error('Seleziona un contratto firmato.')
  if (!file.size || file.size > MAX_BYTES) throw new Error('Il file deve avere una dimensione massima di 10 MB.')
  if (!file.name || file.name.length > 255) throw new Error('Il nome del file è troppo lungo (massimo 255 caratteri).')
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const expectedMime = MIME_TYPES[extension]
  // I file senza MIME sono comuni su alcuni dispositivi; l'estensione resta obbligatoria.
  if (!expectedMime || (file.type && file.type !== expectedMime)) {
    throw new Error('Formato non supportato. Usa PDF, JPG, PNG o WEBP.')
  }
  return { extension, contentType: expectedMime }
}

export async function fetchSignedContracts(staff) {
  const key = staffKey(staff)
  const { data, error } = await supabase
    .from('staff_signed_contracts')
    .select('id,staff_kind,staff_source,staff_id,staff_name,file_name,file_mime,file_size,signed_at,uploaded_at,uploaded_by,file_path')
    .match(key)
    .order('uploaded_at', { ascending: false })
  if (error) throw new Error(error.message || 'Impossibile caricare i contratti firmati.')
  return data || []
}

export async function uploadSignedContract({ staff, file, signedAt }) {
  const key = staffKey(staff)
  const { extension, contentType } = validateSignedContractFile(file)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Sessione Nova scaduta. Accedi nuovamente per caricare il contratto.')

  // Identificatore casuale, nome originale solo nei metadati: non esponiamo
  // nomi o codici fiscali nel percorso di Storage.
  const filePath = `${key.staff_kind}/${key.staff_source}/${encodeURIComponent(key.staff_id)}/${crypto.randomUUID()}.${extension}`
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    contentType,
    upsert: false,
  })
  if (storageError) throw new Error(storageError.message || 'Caricamento del contratto non riuscito.')

  const { data, error } = await supabase.from('staff_signed_contracts').insert({
    ...key,
    staff_name: String(staff.name || '').trim(),
    file_path: filePath,
    file_name: file.name,
    file_mime: contentType,
    file_size: file.size,
    signed_at: signedAt || null,
    uploaded_by: user.id,
  }).select('*').single()

  if (error) {
    // Se i metadati non vengono salvati non lasciamo un file orfano in Storage.
    const { error: rollbackError } = await supabase.storage.from(BUCKET).remove([filePath])
    if (rollbackError) console.error('Pulizia contratto non riuscita:', rollbackError)
    throw new Error(`File caricato ma registrazione nel database non riuscita: ${error.message}`)
  }
  return data
}

export async function openSignedContract(document) {
  if (!document?.file_path) throw new Error('Percorso del contratto mancante.')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(document.file_path, 120)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Impossibile aprire il documento.')
  return data.signedUrl
}
