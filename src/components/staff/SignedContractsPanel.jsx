import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ExternalLink, FileCheck2, FileText, LoaderCircle, UploadCloud } from 'lucide-react'
import { fetchSignedContracts, openSignedContract, uploadSignedContract, validateSignedContractFile } from '../../api/signedContracts'
import './SignedContractsPanel.css'

function formatDate(value) {
  if (!value) return 'Non indicata'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export default function SignedContractsPanel({ kind, source, staffId, staffName, isAdmin }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [signedAt, setSignedAt] = useState('')
  const [message, setMessage] = useState('')
  const [openingId, setOpeningId] = useState(null)
  const staff = { kind, source, id: staffId, name: staffName }
  const queryKey = ['staff-signed-contracts', kind, source, String(staffId)]
  const { data: contracts = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchSignedContracts(staff),
    enabled: Boolean(staffId && kind && source),
  })
  const upload = useMutation({
    mutationFn: () => uploadSignedContract({ staff, file, signedAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setFile(null)
      setSignedAt('')
      setMessage('Contratto firmato archiviato correttamente.')
    },
  })

  function handleFile(event) {
    const picked = event.target.files?.[0] || null
    event.target.value = ''
    setMessage('')
    upload.reset()
    if (picked) {
      try { validateSignedContractFile(picked); setFile(picked) }
      catch (err) { setFile(null); setMessage(err.message) }
    } else setFile(null)
  }

  async function handleOpen(doc) {
    setMessage('')
    // La scheda viene aperta al click, per non essere bloccata dal browser
    // quando il link firmato viene restituito in modo asincrono da Supabase.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    setOpeningId(doc.id)
    try {
      const url = await openSignedContract(doc)
      if (tab && !tab.closed) tab.location.replace(url)
      else window.location.assign(url)
    } catch (err) {
      if (tab && !tab.closed) tab.close()
      setMessage(err?.message || 'Impossibile aprire il file.')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div className="signed-contracts">
      <div className="signed-contracts__head">
        <div className="signed-contracts__symbol"><FileCheck2 size={23} /></div>
        <div>
          <h3>Contratti firmati</h3>
          <p>Archivio riservato, disponibile per consultazione e controlli. Le versioni precedenti rimangono salvate.</p>
        </div>
        <span className="signed-contracts__count">{contracts.length} {contracts.length === 1 ? 'documento' : 'documenti'}</span>
      </div>

      {isAdmin ? (
        <form className="signed-contracts__form" onSubmit={(e) => {
          e.preventDefault()
          if (!file) return setMessage('Seleziona un file da caricare.')
          setMessage('')
          upload.mutate()
        }}>
          <label className="signed-contracts__choose">
            <UploadCloud size={19} />
            <span>{file ? 'Cambia file' : 'Seleziona contratto firmato'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={handleFile} disabled={upload.isPending} />
          </label>
          <label className="signed-contracts__date"><CalendarDays size={17} /><span>Data firma</span><input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} disabled={upload.isPending} /></label>
          <button type="submit" className="signed-contracts__upload" disabled={!file || upload.isPending}>
            {upload.isPending ? <LoaderCircle size={17} className="signed-contracts__spin" /> : <UploadCloud size={17} />}
            {upload.isPending ? 'Caricamento…' : 'Archivia'}
          </button>
          <span className="signed-contracts__help">PDF o immagine, massimo 10 MB. La data firma è facoltativa.</span>
          {file ? <strong className="signed-contracts__selected">{file.name}</strong> : null}
        </form>
      ) : null}

      {message ? <p role="status" className="signed-contracts__message">{message}</p> : null}
      {upload.error ? <p role="alert" className="signed-contracts__error">{upload.error.message}</p> : null}
      {error ? <p role="alert" className="signed-contracts__error">Non riesco a leggere l’archivio: {error.message}. Verifica che lo script SQL di installazione sia stato eseguito su Supabase Nova.</p> : null}
      {isLoading ? <p className="signed-contracts__empty">Caricamento archivio…</p> : null}
      {!isLoading && !error && !contracts.length ? <p className="signed-contracts__empty">Nessun contratto firmato archiviato per questa persona.</p> : null}
      {contracts.length > 0 ? (
        <div className="signed-contracts__list">
          {contracts.map((doc) => (
            <article className="signed-contracts__item" key={doc.id}>
              <div className="signed-contracts__file-icon"><FileText size={21} /></div>
              <div className="signed-contracts__file-info">
                <strong title={doc.file_name}>{doc.file_name}</strong>
                <small>Firma: {formatDate(doc.signed_at)} · Caricato: {formatDate(doc.uploaded_at)} · {(doc.file_size / 1024 / 1024).toFixed(2)} MB</small>
              </div>
              <button className="signed-contracts__view" type="button" onClick={() => handleOpen(doc)} disabled={openingId === doc.id}>
                {openingId === doc.id ? <LoaderCircle className="signed-contracts__spin" size={16} /> : <ExternalLink size={16} />}
                Apri
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
