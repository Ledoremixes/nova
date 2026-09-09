import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  IdCard,
  Keyboard,
  LoaderCircle,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
} from 'lucide-react'
import { fetchOrchideaStudents } from '../api/orchideaEntities'
import { saveAssistedCorsistaMembership } from '../api/assistedMembership'
import {
  fiscalCodeDetails,
  fiscalCodeFromBarcode,
  normalizeFiscalCode,
  validateFiscalCode,
} from '../lib/healthCard'
import '../styles/TesseramentoCorsistaPage.css'

const CURRENT_SEASON = '2026/2027'
const HTML5_QR_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'
const BARCODE_FILE_READER_ID = 'membership-barcode-file-reader'

function emptyForm() {
  return {
    nome: '',
    cognome: '',
    cf: '',
    nascita: '',
    luogo: '',
    telefono: '',
    email: '',
    residenza: '',
  }
}

function fullName(row = {}) {
  return row.nomeCompleto || `${row.nome || ''} ${row.cognome || ''}`.trim() || 'Corsista'
}

function rawStudentValue(student, key) {
  return student?.raw?.[key] ?? student?.[key] ?? ''
}

function formFromStudent(student = {}) {
  return {
    nome: rawStudentValue(student, 'nome') || '',
    cognome: rawStudentValue(student, 'cognome') || '',
    cf: normalizeFiscalCode(rawStudentValue(student, 'cf') || rawStudentValue(student, 'cod_fiscale') || ''),
    nascita: rawStudentValue(student, 'nascita') || rawStudentValue(student, 'data_nascita') || '',
    luogo: rawStudentValue(student, 'luogo') || rawStudentValue(student, 'luogo_nascita') || '',
    telefono: rawStudentValue(student, 'telefono') || rawStudentValue(student, 'cellulare') || '',
    email: rawStudentValue(student, 'email') || '',
    residenza: rawStudentValue(student, 'residenza') || [rawStudentValue(student, 'indirizzo'), rawStudentValue(student, 'citta')].filter(Boolean).join(', '),
  }
}

function loadBarcodeScript() {
  if (window.Html5Qrcode) return Promise.resolve(window)
  const existing = document.querySelector(`script[src="${HTML5_QR_URL}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window), { once: true })
      existing.addEventListener('error', () => reject(new Error('Impossibile caricare il lettore barcode. Controlla la connessione internet.')), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = HTML5_QR_URL
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(window)
    script.onerror = () => reject(new Error('Impossibile caricare il lettore barcode. Controlla la connessione internet.'))
    document.head.appendChild(script)
  })
}

function barcodeFormats() {
  const formats = window.Html5QrcodeSupportedFormats
  if (!formats) return undefined
  return [formats.CODE_39, formats.CODE_128, formats.CODABAR, formats.EAN_13].filter((item) => item != null)
}

function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const dirtyRef = useRef(Boolean(value))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const snapshot = dirtyRef.current ? canvas.toDataURL('image/png') : null
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#172033'

      if (snapshot) {
        const image = new Image()
        image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height)
        image.src = snapshot
      }
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function point(event) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function start(event) {
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const p = point(event)
    drawingRef.current = true
    canvas.setPointerCapture?.(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(event) {
    if (!drawingRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const p = point(event)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    dirtyRef.current = true
  }

  function end(event) {
    if (!drawingRef.current) return
    event.preventDefault()
    drawingRef.current = false
    const canvas = canvasRef.current
    canvas.releasePointerCapture?.(event.pointerId)
    if (dirtyRef.current) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, rect.width, rect.height)
    dirtyRef.current = false
    onChange('')
  }

  return (
    <div className="membership-signature-wrap">
      <canvas
        ref={canvasRef}
        className="membership-signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Firma del cliente"
      />
      {!value ? <span className="membership-signature-placeholder"><PenLine size={24} /> Firma qui con il dito</span> : null}
      <button type="button" className="membership-signature-clear" onClick={clear}><Trash2 size={16} /> Cancella firma</button>
    </div>
  )
}

export default function TesseramentoCorsistaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [matchedStudent, setMatchedStudent] = useState(null)
  const [barcodeVerified, setBarcodeVerified] = useState(false)
  const [barcodeStatus, setBarcodeStatus] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [barcodeBusy, setBarcodeBusy] = useState(false)
  const [signature, setSignature] = useState('')
  const [consents, setConsents] = useState({ data_confirmed: false, privacy: false, membership: false })
  const [result, setResult] = useState(null)

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
  })

  const students = useMemo(() => studentsQuery.data || [], [studentsQuery.data])
  const fiscalDetails = useMemo(() => fiscalCodeDetails(form.cf), [form.cf])
  const fiscalValid = useMemo(() => validateFiscalCode(form.cf), [form.cf])

  const requiredFields = useMemo(() => [
    ['nome', 'Nome'],
    ['cognome', 'Cognome'],
    ['cf', 'Codice fiscale'],
    ['nascita', 'Data di nascita'],
    ['luogo', 'Luogo di nascita'],
    ['telefono', 'Telefono'],
    ['email', 'Email'],
    ['residenza', 'Residenza'],
  ], [])

  const missingFields = useMemo(() => requiredFields
    .filter(([key]) => {
      if (key === 'cf') return !fiscalValid
      if (key === 'email') return !form.email.trim().includes('@')
      return !String(form[key] || '').trim()
    })
    .map(([, label]) => label), [form, fiscalValid, requiredFields])

  const completedFields = requiredFields.length - missingFields.length
  const formComplete = missingFields.length === 0
  const consentsComplete = consents.data_confirmed && consents.privacy && consents.membership

  function findStudentByCf(cf) {
    const normalized = normalizeFiscalCode(cf)
    return students.find((student) => normalizeFiscalCode(student.cf || student.raw?.cf || student.raw?.cod_fiscale) === normalized) || null
  }

  function applyFiscalCode(cf, { verified = false, autoAdvance = false } = {}) {
    const normalized = normalizeFiscalCode(cf)
    if (!normalized) return

    const details = fiscalCodeDetails(normalized)
    const existing = findStudentByCf(normalized)

    if (existing) {
      setMatchedStudent(existing)
      setForm(formFromStudent(existing))
      setBarcodeStatus(`Rinnovo trovato: ${fullName(existing)}. Nova ha recuperato i dati già presenti.`)
    } else {
      setMatchedStudent(null)
      setForm((current) => ({
        ...current,
        cf: normalized,
        nascita: current.nascita || details?.birthDate || '',
      }))
      setBarcodeStatus('Nuovo corsista. Codice fiscale acquisito: completa solo i dati mancanti.')
    }

    setBarcodeVerified(verified && validateFiscalCode(normalized))
    if (autoAdvance) setStep(2)
  }

  function acceptDecodedBarcode(rawValue) {
    const cf = fiscalCodeFromBarcode(rawValue)
    if (!cf || !validateFiscalCode(cf)) {
      throw new Error('Il barcode è stato letto, ma non contiene un codice fiscale valido. Riprova con una foto più vicina.')
    }
    applyFiscalCode(cf, { verified: true, autoAdvance: true })
  }

  async function scanBarcodeFile(file) {
    if (!file) return
    setBarcodeBusy(true)
    setBarcodeError('')
    setBarcodeStatus('')

    try {
      await loadBarcodeScript()
      if (!window.Html5Qrcode) throw new Error('Lettore barcode non disponibile.')

      const scanner = new window.Html5Qrcode(BARCODE_FILE_READER_ID, {
        formatsToSupport: barcodeFormats(),
        verbose: false,
      })

      try {
        const decodedText = await scanner.scanFile(file, true)
        acceptDecodedBarcode(decodedText)
      } finally {
        try {
          scanner.clear()
        } catch {
          // Nessuna azione necessaria.
        }
      }
    } catch (error) {
      setBarcodeError(
        error?.message?.includes('No MultiFormat Readers')
          ? 'Non riesco a leggere il barcode. Rifai la foto più vicina, dritta, nitida e con un po’ di spazio bianco ai lati delle barre.'
          : (error.message || 'Barcode non riconosciuto. Riprova con una foto più vicina e nitida.'),
      )
    } finally {
      setBarcodeBusy(false)
    }
  }

  function changeCf(value) {
    const normalized = normalizeFiscalCode(value).slice(0, 16)
    setBarcodeVerified(false)
    setBarcodeStatus('')
    setBarcodeError('')

    const valid = validateFiscalCode(normalized)
    const existing = valid ? findStudentByCf(normalized) : null
    if (existing) {
      setMatchedStudent(existing)
      setForm(formFromStudent(existing))
      setBarcodeStatus(`Rinnovo trovato: ${fullName(existing)}. Dati recuperati automaticamente.`)
      return
    }

    if (matchedStudent) setMatchedStudent(null)
    const details = valid ? fiscalCodeDetails(normalized) : null
    setForm((current) => ({
      ...current,
      cf: normalized,
      nascita: valid ? (details?.birthDate || current.nascita) : current.nascita,
    }))
  }

  const saveMutation = useMutation({
    mutationFn: () => saveAssistedCorsistaMembership({
      student_id: matchedStudent?.id || null,
      stagione: CURRENT_SEASON,
      person: form,
      consents,
      signature_data_url: signature,
      extraction: {
        source: barcodeVerified ? 'barcode_foto' : 'manuale',
        barcode_cf_verified: barcodeVerified,
        ocr_confidence: null,
      },
    }),
    onSuccess: async (data) => {
      setResult(data)
      setStep(4)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orchidea-atleti-corsisti'] }),
        queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] }),
      ])
    },
  })

  function resetAll() {
    setStep(1)
    setForm(emptyForm())
    setMatchedStudent(null)
    setBarcodeVerified(false)
    setBarcodeStatus('')
    setBarcodeError('')
    setBarcodeBusy(false)
    setSignature('')
    setConsents({ data_confirmed: false, privacy: false, membership: false })
    setResult(null)
    saveMutation.reset()
  }

  if (result) {
    return (
      <section className="membership-page">
        <div className="membership-success">
          <span className="membership-success__icon"><CheckCircle2 size={36} /></span>
          <span className="membership-eyebrow">Tesseramento completato</span>
          <h1>{fullName(result.student)}</h1>
          <p>Firma e dati sono stati salvati. Ora puoi passare direttamente all’assegnazione corsi e al pagamento.</p>

          <div className="membership-success__grid">
            <div><span>Numero tessera</span><strong>{result.student.numero_tessera || 'Assegnato'}</strong></div>
            <div><span>Stagione</span><strong>{result.student.stagione || CURRENT_SEASON}</strong></div>
            <div><span>Anagrafica</span><strong>{result.existing ? 'Rinnovata' : 'Nuova'}</strong></div>
            <div><span>Quota corsista</span><strong>25 € da gestire</strong><small>La tessera non viene mai omaggiata.</small></div>
          </div>

          <div className="membership-success__actions">
            <button type="button" className="membership-button membership-button--secondary" onClick={resetAll}><RefreshCw size={18} /> Nuovo tesseramento</button>
            <button type="button" className="membership-button membership-button--primary" onClick={() => navigate('/iscrizione-corsista', { state: { student: result.student } })}>
              Continua con corsi e pagamento <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="membership-page">
      <div className="membership-hero">
        <div>
          <span className="membership-eyebrow"><Sparkles size={15} /> Flusso rapido segreteria</span>
          <h1>Tesseramento corsista</h1>
          <p>Tre passaggi guidati: fotografa il barcode, controlla i dati e passa il tablet al cliente per la firma.</p>
        </div>
        <div className="membership-hero__badge"><ShieldCheck size={22} /><span><strong>3 passaggi</strong><small>firma cliente obbligatoria</small></span></div>
      </div>

      <div className="membership-step-strip">
        <button type="button" className={step === 1 ? 'is-active' : step > 1 ? 'is-done' : ''} onClick={() => step > 1 && setStep(1)}><b>{step > 1 ? <Check size={15} /> : '1'}</b><span>Identifica</span></button>
        <i />
        <button type="button" className={step === 2 ? 'is-active' : step > 2 ? 'is-done' : ''} onClick={() => step > 2 && setStep(2)}><b>{step > 2 ? <Check size={15} /> : '2'}</b><span>Dati</span></button>
        <i />
        <button type="button" className={step === 3 ? 'is-active' : step > 3 ? 'is-done' : ''}><b>{step > 3 ? <Check size={15} /> : '3'}</b><span>Firma</span></button>
      </div>

      {step === 1 ? (
        <div className="membership-stage">
          <div className="membership-card-head">
            <span className="membership-step-icon"><IdCard size={23} /></span>
            <div><span>Passaggio 1</span><h2>Identifica il corsista</h2><p>Usa solo la foto del barcode sul retro: è il metodo che funziona meglio e fa risparmiare più tempo.</p></div>
          </div>

          <div className="membership-barcode-flow">
            <div className="membership-barcode-visual" aria-hidden="true">
              <CreditCard size={42} />
              <div className="membership-barcode-lines"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              <span>RETRO TESSERA SANITARIA</span>
            </div>

            <div className="membership-barcode-copy">
              <span className="membership-mini-pill">Metodo consigliato</span>
              <h3>Fotografa il barcode</h3>
              <div className="membership-instructions">
                <span><b>1</b> Gira la Tessera Sanitaria sul retro.</span>
                <span><b>2</b> Avvicinati al barcode e tienilo dritto.</span>
                <span><b>3</b> Scatta: Nova trova subito il corsista.</span>
              </div>

              <label className={`membership-photo-button ${barcodeBusy || studentsQuery.isLoading ? 'is-disabled' : ''}`}>
                {barcodeBusy ? <LoaderCircle size={22} className="membership-spin" /> : <Camera size={22} />}
                <span><strong>{barcodeBusy ? 'Sto leggendo il barcode…' : 'Fotografa barcode'}</strong><small>{studentsQuery.isLoading ? 'Carico l’anagrafica…' : 'Si apre direttamente la fotocamera'}</small></span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={barcodeBusy || studentsQuery.isLoading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    scanBarcodeFile(file)
                  }}
                />
              </label>
            </div>
          </div>

          <div id={BARCODE_FILE_READER_ID} className="membership-hidden-barcode-reader" aria-hidden="true" />

          {barcodeError ? <div className="membership-alert membership-alert--error">{barcodeError}</div> : null}
          {barcodeStatus ? <div className={`membership-alert ${matchedStudent ? 'membership-alert--success' : 'membership-alert--info'}`}><BadgeCheck size={19} /> {barcodeStatus}</div> : null}

          <details className="membership-manual-panel">
            <summary><Keyboard size={18} /><span><strong>Il barcode non si legge?</strong><small>Usa il codice fiscale manualmente</small></span></summary>
            <div className="membership-manual-panel__body">
              <label><span>Codice fiscale</span><div className="membership-cf-input-wrap"><input value={form.cf} onChange={(event) => changeCf(event.target.value)} placeholder="INSERISCI IL CODICE FISCALE" maxLength={16} autoCapitalize="characters" autoComplete="off" />{form.cf.length === 16 ? <em className={fiscalValid ? 'is-valid' : 'is-invalid'}>{fiscalValid ? 'Valido' : 'Controlla'}</em> : null}</div></label>
              <button type="button" className="membership-button membership-button--primary" disabled={!fiscalValid} onClick={() => setStep(2)}>Continua <ArrowRight size={18} /></button>
            </div>
          </details>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="membership-stage">
          <div className="membership-card-head">
            <span className="membership-step-icon"><UserRoundCheck size={23} /></span>
            <div><span>Passaggio 2</span><h2>Controlla e completa i dati</h2><p>Nova ti evidenzia ciò che manca. Quando è tutto completo puoi passare il tablet al cliente.</p></div>
            <button type="button" className="membership-text-button" onClick={() => setStep(1)}><ArrowLeft size={16} /> Cambia tessera</button>
          </div>

          {matchedStudent ? (
            <div className="membership-alert membership-alert--success membership-person-found">
              <UserRoundCheck size={21} />
              <span><strong>Rinnovo trovato: {fullName(matchedStudent)}</strong><small>I vecchi dati sono già stati recuperati. Controlla soprattutto telefono, email e residenza.</small></span>
            </div>
          ) : (
            <div className="membership-alert membership-alert--info membership-person-found">
              <BadgeCheck size={21} />
              <span><strong>Nuovo corsista</strong><small>Codice fiscale e data di nascita sono già stati ricavati. Completa i campi mancanti.</small></span>
            </div>
          )}

          <div className="membership-completion-card">
            <div><span>Dati completati</span><strong>{completedFields}/{requiredFields.length}</strong></div>
            <div className="membership-completion-bar"><i style={{ width: `${Math.round((completedFields / requiredFields.length) * 100)}%` }} /></div>
            {missingFields.length ? <small>Mancano: {missingFields.join(' · ')}</small> : <small className="is-complete"><CheckCircle2 size={15} /> Tutti i dati sono completi</small>}
          </div>

          <div className="membership-data-card">
            <div className="membership-data-card__head"><span>Dati personali</span><small>Controlla i dati anagrafici</small></div>
            <div className="membership-form-grid">
              <label className={form.nome.trim() ? 'is-complete' : 'is-missing'}><span>Nome *</span><input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} autoComplete="off" /></label>
              <label className={form.cognome.trim() ? 'is-complete' : 'is-missing'}><span>Cognome *</span><input value={form.cognome} onChange={(event) => setForm({ ...form, cognome: event.target.value })} autoComplete="off" /></label>
              <label className={`membership-field-cf ${fiscalValid ? 'is-complete' : 'is-missing'}`}><span>Codice fiscale *</span><div><input value={form.cf} onChange={(event) => changeCf(event.target.value)} maxLength={16} autoCapitalize="characters" autoComplete="off" /><em className={fiscalValid ? 'is-valid' : 'is-invalid'}>{fiscalValid ? (barcodeVerified ? 'Letto dal barcode' : 'Valido') : 'Non valido'}</em></div></label>
              <label className={form.nascita ? 'is-complete' : 'is-missing'}><span>Data di nascita *</span><input type="date" value={form.nascita} onChange={(event) => setForm({ ...form, nascita: event.target.value })} /></label>
              <label className={form.luogo.trim() ? 'is-complete' : 'is-missing'}><span>Luogo di nascita *</span><input value={form.luogo} onChange={(event) => setForm({ ...form, luogo: event.target.value })} autoComplete="off" /></label>
              <div className="membership-derived-info"><span>Sesso da CF</span><strong>{fiscalDetails?.sex || '—'}</strong><small>Codice comune: {fiscalDetails?.birthplaceCode || '—'}</small></div>
            </div>
          </div>

          <div className="membership-data-card">
            <div className="membership-data-card__head"><span>Contatti e residenza</span><small>Chiedi al corsista solo quello che manca</small></div>
            <div className="membership-form-grid">
              <label className={form.telefono.trim() ? 'is-complete' : 'is-missing'}><span>Telefono *</span><input type="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} autoComplete="off" /></label>
              <label className={form.email.trim().includes('@') ? 'is-complete' : 'is-missing'}><span>Email *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="off" /></label>
              <label className={`is-wide ${form.residenza.trim() ? 'is-complete' : 'is-missing'}`}><span>Residenza / indirizzo completo *</span><input value={form.residenza} onChange={(event) => setForm({ ...form, residenza: event.target.value })} placeholder="Via, numero civico, CAP, Comune" autoComplete="off" /></label>
            </div>
          </div>

          <div className="membership-stage__actions">
            <button type="button" className="membership-button membership-button--secondary" onClick={() => setStep(1)}>Indietro</button>
            <button type="button" className="membership-button membership-button--primary membership-next-button" disabled={!formComplete} onClick={() => setStep(3)}>Passa il tablet al cliente <ArrowRight size={18} /></button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="membership-stage membership-stage--client">
          <div className="membership-client-banner"><ShieldCheck size={27} /><div><span>Passaggio 3 · Modalità cliente</span><strong>Controlla i dati e firma</strong><small>Da questo momento puoi girare il tablet verso il corsista.</small></div></div>

          <div className="membership-review-card">
            <div className="membership-review-card__head"><span className="membership-avatar membership-avatar--large"><UserRoundCheck size={28} /></span><div><span>Tesseramento corsista {CURRENT_SEASON}</span><h2>{form.nome} {form.cognome}</h2><small>{form.cf}</small></div></div>
            <div className="membership-review-grid">
              <div><span>Data di nascita</span><strong>{form.nascita}</strong></div>
              <div><span>Luogo di nascita</span><strong>{form.luogo}</strong></div>
              <div><span>Telefono</span><strong>{form.telefono}</strong></div>
              <div><span>Email</span><strong>{form.email}</strong></div>
              <div className="is-wide"><span>Residenza</span><strong>{form.residenza}</strong></div>
            </div>
          </div>

          <div className="membership-consents">
            <label><input type="checkbox" checked={consents.data_confirmed} onChange={(event) => setConsents({ ...consents, data_confirmed: event.target.checked })} /><span><strong>Confermo che i dati sopra indicati sono corretti.</strong><small>Se qualcosa non è corretto, chiedi alla segreteria di tornare indietro.</small></span></label>
            <label><input type="checkbox" checked={consents.privacy} onChange={(event) => setConsents({ ...consents, privacy: event.target.checked })} /><span><strong>Confermo di aver preso visione dell’informativa privacy relativa al trattamento dei dati per il tesseramento.</strong></span></label>
            <label><input type="checkbox" checked={consents.membership} onChange={(event) => setConsents({ ...consents, membership: event.target.checked })} /><span><strong>Confermo la richiesta di tesseramento all’associazione per la stagione {CURRENT_SEASON}.</strong></span></label>
          </div>

          <div className="membership-signature-section">
            <div><span className="membership-eyebrow"><PenLine size={15} /> Firma obbligatoria</span><h3>Firma del cliente</h3><p>Firma nel riquadro usando il dito o una penna touch.</p></div>
            <SignaturePad value={signature} onChange={setSignature} />
          </div>

          {saveMutation.error ? <div className="membership-alert membership-alert--error">{saveMutation.error.message}</div> : null}

          <div className="membership-stage__actions">
            <button type="button" className="membership-button membership-button--secondary" disabled={saveMutation.isPending} onClick={() => setStep(2)}>Correggi dati</button>
            <button type="button" className="membership-button membership-button--primary membership-button--finish" disabled={!consentsComplete || !signature || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <><LoaderCircle size={19} className="membership-spin" /> Salvo tesseramento e firma…</> : <><CheckCircle2 size={19} /> Conferma e completa tesseramento</>}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
