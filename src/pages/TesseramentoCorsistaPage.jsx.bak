import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  FileScan,
  IdCard,
  Keyboard,
  LoaderCircle,
  PenLine,
  RefreshCw,
  ScanLine,
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
  parseHealthCardOcr,
  preprocessHealthCardImage,
  validateFiscalCode,
} from '../lib/healthCard'
import '../styles/TesseramentoCorsistaPage.css'

const CURRENT_SEASON = '2026/2027'
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'

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

function mergeOcrIntoForm(current, ocr) {
  return {
    ...current,
    nome: ocr.nome || current.nome,
    cognome: ocr.cognome || current.cognome,
    cf: ocr.cf || current.cf,
    nascita: ocr.nascita || current.nascita,
    luogo: ocr.luogo || current.luogo,
  }
}

function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  const existing = document.querySelector(`script[src="${TESSERACT_URL}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.Tesseract), { once: true })
      existing.addEventListener('error', () => reject(new Error('Impossibile caricare il motore OCR. Controlla la connessione internet.')), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TESSERACT_URL
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(window.Tesseract)
    script.onerror = () => reject(new Error('Impossibile caricare il motore OCR. Controlla la connessione internet.'))
    document.head.appendChild(script)
  })
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
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanTimerRef = useRef(null)
  const detectorRef = useRef(null)
  const ocrWorkerRef = useRef(null)
  const mountedRef = useRef(true)

  const [step, setStep] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [matchedStudent, setMatchedStudent] = useState(null)
  const [barcodeVerified, setBarcodeVerified] = useState(false)
  const [barcodeStatus, setBarcodeStatus] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrConfidence, setOcrConfidence] = useState(null)
  const [ocrSource, setOcrSource] = useState('manuale')
  const [frontPreview, setFrontPreview] = useState('')
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
  const formComplete = Boolean(
    form.nome.trim()
    && form.cognome.trim()
    && fiscalValid
    && form.nascita
    && form.luogo.trim()
    && form.telefono.trim()
    && form.email.trim().includes('@')
    && form.residenza.trim(),
  )
  const consentsComplete = consents.data_confirmed && consents.privacy && consents.membership

  useEffect(() => {
    return () => {
      mountedRef.current = false
      stopCamera()
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate?.().catch?.(() => {})
      }
      if (frontPreview) URL.revokeObjectURL(frontPreview)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function findStudentByCf(cf) {
    const normalized = normalizeFiscalCode(cf)
    return students.find((student) => normalizeFiscalCode(student.cf) === normalized) || null
  }

  function applyFiscalCode(cf, { verified = false, source = 'manuale' } = {}) {
    const normalized = normalizeFiscalCode(cf)
    if (!normalized) return
    const details = fiscalCodeDetails(normalized)
    const existing = findStudentByCf(normalized)

    if (existing) {
      setMatchedStudent(existing)
      setForm(formFromStudent(existing))
      setBarcodeStatus(`Trovato: ${fullName(existing)}. I dati già presenti sono stati recuperati automaticamente.`)
    } else {
      setMatchedStudent(null)
      setForm((current) => ({
        ...current,
        cf: normalized,
        nascita: current.nascita || details?.birthDate || '',
      }))
      setBarcodeStatus(verified ? 'Codice fiscale letto correttamente. Non risulta un tesseramento precedente: nuova anagrafica.' : '')
    }

    setBarcodeVerified(verified && validateFiscalCode(normalized))
    if (source !== 'manuale') setOcrSource(source)
  }

  function stopCamera() {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOpen(false)
  }

  async function scanVideoFrame() {
    if (!cameraOpen || !videoRef.current || !detectorRef.current) return
    try {
      const codes = await detectorRef.current.detect(videoRef.current)
      for (const code of codes || []) {
        const cf = fiscalCodeFromBarcode(code.rawValue)
        if (cf && validateFiscalCode(cf)) {
          applyFiscalCode(cf, { verified: true, source: 'barcode' })
          stopCamera()
          return
        }
      }
    } catch {
      // Un frame non leggibile è normale durante la messa a fuoco.
    }
    scanTimerRef.current = setTimeout(scanVideoFrame, 180)
  }

  async function startCamera() {
    setCameraError('')
    setBarcodeStatus('')

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Fotocamera non disponibile su questo dispositivo.')
      if (!('BarcodeDetector' in window)) {
        throw new Error('Questo browser non supporta la lettura rapida del barcode. Usa Chrome aggiornato sul tablet oppure inserisci il codice fiscale manualmente.')
      }

      const supported = await window.BarcodeDetector.getSupportedFormats?.()
      const preferred = ['code_39', 'code_128', 'codabar', 'ean_13'].filter((format) => !supported || supported.includes(format))
      detectorRef.current = new window.BarcodeDetector({ formats: preferred.length ? preferred : undefined })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)

      requestAnimationFrame(async () => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        scanTimerRef.current = setTimeout(scanVideoFrame, 250)
      })
    } catch (error) {
      stopCamera()
      setCameraError(error.message || 'Non riesco ad aprire la fotocamera.')
    }
  }

  async function ensureOcrWorker() {
    const Tesseract = await loadTesseractScript()
    if (ocrWorkerRef.current) return ocrWorkerRef.current

    setOcrMessage('Preparo il lettore OCR…')
    ocrWorkerRef.current = await Tesseract.createWorker('ita+eng', 1, {
      logger: (message) => {
        if (!mountedRef.current) return
        if (typeof message.progress === 'number') setOcrProgress(Math.round(message.progress * 100))
        if (message.status) setOcrMessage(message.status === 'recognizing text' ? 'Leggo i dati stampati…' : 'Preparo il riconoscimento…')
      },
    })
    return ocrWorkerRef.current
  }

  async function recognizeFront(file) {
    if (!file) return
    setOcrBusy(true)
    setOcrProgress(0)
    setOcrMessage('Ottimizzo la foto…')
    setOcrConfidence(null)

    if (frontPreview) URL.revokeObjectURL(frontPreview)
    setFrontPreview(URL.createObjectURL(file))

    try {
      const worker = await ensureOcrWorker()
      const image = await preprocessHealthCardImage(file)
      const first = await worker.recognize(image)
      let parsed = parseHealthCardOcr(first.data?.text || '')
      let confidence = Number(first.data?.confidence || 0)

      const criticalMissing = !parsed.nome || !parsed.cognome || !parsed.nascita || !parsed.luogo
      if (criticalMissing && confidence < 88) {
        setOcrMessage('Raffino automaticamente la lettura…')
        const thresholded = await preprocessHealthCardImage(file, { threshold: true })
        const second = await worker.recognize(thresholded)
        const secondParsed = parseHealthCardOcr(second.data?.text || '')
        const secondConfidence = Number(second.data?.confidence || 0)
        const firstScore = [parsed.nome, parsed.cognome, parsed.nascita, parsed.luogo, parsed.cf].filter(Boolean).length + confidence / 100
        const secondScore = [secondParsed.nome, secondParsed.cognome, secondParsed.nascita, secondParsed.luogo, secondParsed.cf].filter(Boolean).length + secondConfidence / 100
        if (secondScore > firstScore) {
          parsed = secondParsed
          confidence = secondConfidence
        }
      }

      setOcrConfidence(Math.round(confidence))
      setOcrSource(barcodeVerified ? 'barcode+ocr' : 'ocr')

      const ocrCf = normalizeFiscalCode(parsed.cf)
      if (ocrCf && validateFiscalCode(ocrCf) && !form.cf) {
        applyFiscalCode(ocrCf, { verified: false, source: 'ocr' })
      }

      setForm((current) => {
        if (matchedStudent) return current
        const merged = mergeOcrIntoForm(current, parsed)
        if (barcodeVerified && form.cf) {
          merged.cf = form.cf
          merged.nascita = fiscalCodeDetails(form.cf)?.birthDate || merged.nascita
        }
        return merged
      })
      setOcrMessage('Lettura completata. Controlla i dati evidenziati prima della firma.')
    } catch (error) {
      setOcrMessage(error.message || 'Non sono riuscito a leggere il tesserino. Riprova con più luce e senza riflessi.')
    } finally {
      setOcrBusy(false)
      setOcrProgress(100)
    }
  }

  function changeCf(value) {
    const normalized = normalizeFiscalCode(value).slice(0, 16)
    setForm((current) => ({ ...current, cf: normalized }))
    setBarcodeVerified(false)
    setBarcodeStatus('')
    const existing = normalized.length === 16 ? findStudentByCf(normalized) : null
    if (existing) {
      setMatchedStudent(existing)
      setForm(formFromStudent(existing))
      setBarcodeStatus(`Trovato: ${fullName(existing)}. Dati recuperati dal tesseramento precedente.`)
    } else if (matchedStudent) {
      setMatchedStudent(null)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => saveAssistedCorsistaMembership({
      student_id: matchedStudent?.id || null,
      stagione: CURRENT_SEASON,
      person: form,
      consents,
      signature_data_url: signature,
      extraction: {
        source: ocrSource,
        barcode_cf_verified: barcodeVerified,
        ocr_confidence: ocrConfidence,
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
    stopCamera()
    if (frontPreview) URL.revokeObjectURL(frontPreview)
    setStep(1)
    setForm(emptyForm())
    setMatchedStudent(null)
    setBarcodeVerified(false)
    setBarcodeStatus('')
    setCameraError('')
    setOcrBusy(false)
    setOcrProgress(0)
    setOcrMessage('')
    setOcrConfidence(null)
    setOcrSource('manuale')
    setFrontPreview('')
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
          <p>I dati sono stati confermati e la firma è stata salvata nell’archivio privato di Nova. Le foto della Tessera Sanitaria non vengono conservate.</p>

          <div className="membership-success__grid">
            <div><span>Numero tessera</span><strong>{result.student.numero_tessera || 'Assegnato'}</strong></div>
            <div><span>Stagione</span><strong>{result.student.stagione || CURRENT_SEASON}</strong></div>
            <div><span>Anagrafica</span><strong>{result.existing ? 'Rinnovata' : 'Nuova'}</strong></div>
            <div><span>Quota corsista</span><strong>25 € da gestire</strong><small>La firma non rende mai gratuita la tessera.</small></div>
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
          <span className="membership-eyebrow"><Sparkles size={15} /> Tesseramento assistito</span>
          <h1>Tesseramento corsista</h1>
          <p>Leggi la Tessera Sanitaria, recupera i vecchi dati e fai intervenire il cliente solo per controllo e firma.</p>
        </div>
        <div className="membership-hero__badge"><ShieldCheck size={22} /><span><strong>Firma obbligatoria</strong><small>foto tessera non archiviate</small></span></div>
      </div>

      <div className="membership-steps">
        <button type="button" className={step === 1 ? 'is-active' : step > 1 ? 'is-done' : ''} onClick={() => step > 1 && setStep(1)}><b>{step > 1 ? <Check size={15} /> : '1'}</b><span>Tessera sanitaria</span></button>
        <i />
        <button type="button" className={step === 2 ? 'is-active' : step > 2 ? 'is-done' : ''} onClick={() => step > 2 && setStep(2)}><b>{step > 2 ? <Check size={15} /> : '2'}</b><span>Controllo dati</span></button>
        <i />
        <button type="button" className={step === 3 ? 'is-active' : step > 3 ? 'is-done' : ''}><b>{step > 3 ? <Check size={15} /> : '3'}</b><span>Firma cliente</span></button>
        <i />
        <button type="button" className={step === 4 ? 'is-active' : ''}><b>4</b><span>Fine</span></button>
      </div>

      {step === 1 ? (
        <div className="membership-stage">
          <div className="membership-stage__heading">
            <span className="membership-stage__number">1</span>
            <div><h2>Inquadra la Tessera Sanitaria</h2><p>Per i rinnovi basta il barcode. Per un nuovo corsista fotografa anche il fronte: Nova prova a compilare automaticamente i dati stampati.</p></div>
          </div>

          <div className="membership-scan-grid">
            <article className="membership-scan-card membership-scan-card--barcode">
              <span className="membership-scan-card__icon"><ScanLine size={27} /></span>
              <div><span className="membership-scan-card__tag">Più veloce · consigliato</span><h3>Scansiona il barcode</h3><p>Inquadra il codice a barre della Tessera Sanitaria. Il codice fiscale viene verificato e Nova cerca subito l’anagrafica esistente.</p></div>
              <button type="button" className="membership-button membership-button--primary" onClick={cameraOpen ? stopCamera : startCamera}><Camera size={18} /> {cameraOpen ? 'Chiudi fotocamera' : 'Avvia fotocamera'}</button>
            </article>

            <article className="membership-scan-card">
              <span className="membership-scan-card__icon"><FileScan size={27} /></span>
              <div><span className="membership-scan-card__tag">Per nuovi corsisti</span><h3>Leggi il fronte con OCR</h3><p>Fotografa il fronte in orizzontale, senza riflessi. Nova legge nome, cognome, nascita e luogo e poi ti fa controllare tutto.</p></div>
              <label className={`membership-button membership-button--secondary membership-file-button ${ocrBusy ? 'is-disabled' : ''}`}>
                {ocrBusy ? <LoaderCircle size={18} className="membership-spin" /> : <CreditCard size={18} />}
                {ocrBusy ? 'Lettura in corso…' : 'Fotografa / carica fronte'}
                <input type="file" accept="image/*" capture="environment" disabled={ocrBusy} onChange={(event) => recognizeFront(event.target.files?.[0])} />
              </label>
            </article>
          </div>

          {cameraOpen ? (
            <div className="membership-camera-panel">
              <div className="membership-camera-frame">
                <video ref={videoRef} playsInline muted />
                <span className="membership-camera-guide"><i /><i /><i /><i /></span>
                <strong>Porta il barcode dentro al riquadro</strong>
              </div>
              <p>La lettura si chiude da sola appena Nova riconosce un codice fiscale valido.</p>
            </div>
          ) : null}

          {cameraError ? <div className="membership-alert membership-alert--error">{cameraError}</div> : null}
          {barcodeStatus ? <div className={`membership-alert ${matchedStudent ? 'membership-alert--success' : 'membership-alert--info'}`}><BadgeCheck size={19} /> {barcodeStatus}</div> : null}

          {ocrBusy || ocrMessage ? (
            <div className="membership-ocr-status">
              <div><span>{ocrBusy ? <LoaderCircle size={18} className="membership-spin" /> : <CheckCircle2 size={18} />}</span><div><strong>{ocrMessage || 'OCR pronto'}</strong><small>{ocrConfidence != null ? `Qualità lettura: ${ocrConfidence}%` : 'La prima lettura può richiedere qualche secondo; le successive sono più rapide.'}</small></div></div>
              <div className="membership-progress"><i style={{ width: `${ocrProgress}%` }} /></div>
            </div>
          ) : null}

          <div className="membership-manual-cf">
            <span><Keyboard size={19} /><strong>Oppure inserisci il codice fiscale</strong><small>utile se la fotocamera non è disponibile</small></span>
            <div className="membership-cf-input-wrap">
              <input value={form.cf} onChange={(event) => changeCf(event.target.value)} placeholder="RSSMRA80A01H501U" autoCapitalize="characters" autoComplete="off" />
              {form.cf.length === 16 ? <em className={fiscalValid ? 'is-valid' : 'is-invalid'}>{fiscalValid ? 'Valido' : 'Controlla'}</em> : null}
            </div>
          </div>

          {form.cf ? (
            <div className="membership-scan-summary">
              <div className="membership-scan-summary__top">
                <span className="membership-avatar"><IdCard size={25} /></span>
                <div><span>{matchedStudent ? 'Anagrafica già presente' : 'Nuova anagrafica'}</span><strong>{matchedStudent ? fullName(matchedStudent) : (form.nome || form.cognome ? `${form.nome} ${form.cognome}`.trim() : 'Dati da completare')}</strong><small>{form.cf} {barcodeVerified ? '· barcode verificato' : ''}</small></div>
              </div>
              <div className="membership-scan-summary__facts">
                <span><small>Data nascita</small><strong>{form.nascita || fiscalDetails?.birthDate || '—'}</strong></span>
                <span><small>Sesso da CF</small><strong>{fiscalDetails?.sex || '—'}</strong></span>
                <span><small>Codice comune</small><strong>{fiscalDetails?.birthplaceCode || '—'}</strong></span>
              </div>
            </div>
          ) : null}

          {frontPreview ? <div className="membership-photo-note"><img src={frontPreview} alt="Anteprima Tessera Sanitaria" /><span><ShieldCheck size={17} /><strong>Foto usata solo per la lettura</strong><small>Non viene inviata né salvata nell’archivio Nova.</small></span></div> : null}

          <div className="membership-stage__actions membership-stage__actions--right">
            <button type="button" className="membership-button membership-button--primary" disabled={!form.cf || !fiscalValid} onClick={() => setStep(2)}>Continua ai dati <ArrowRight size={18} /></button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="membership-stage">
          <div className="membership-stage__heading">
            <span className="membership-stage__number">2</span>
            <div><h2>Controlla e completa i dati</h2><p>I campi recuperati sono modificabili. Prima della firma la segretaria deve verificare che i dati siano corretti.</p></div>
          </div>

          {matchedStudent ? <div className="membership-alert membership-alert--success"><UserRoundCheck size={20} /><span><strong>Rinnovo di {fullName(matchedStudent)}</strong><small>Ho recuperato i dati del tesseramento precedente. Aggiorna solo ciò che è cambiato.</small></span></div> : null}

          <div className="membership-form-grid">
            <label><span>Nome *</span><input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} autoComplete="off" /></label>
            <label><span>Cognome *</span><input value={form.cognome} onChange={(event) => setForm({ ...form, cognome: event.target.value })} autoComplete="off" /></label>
            <label className="membership-field-cf"><span>Codice fiscale *</span><div><input value={form.cf} onChange={(event) => changeCf(event.target.value)} maxLength={16} autoCapitalize="characters" autoComplete="off" /><em className={fiscalValid ? 'is-valid' : 'is-invalid'}>{fiscalValid ? (barcodeVerified ? 'Verificato da barcode' : 'Formalmente valido') : 'Non valido'}</em></div></label>
            <label><span>Data di nascita *</span><input type="date" value={form.nascita} onChange={(event) => setForm({ ...form, nascita: event.target.value })} /></label>
            <label><span>Luogo di nascita *</span><input value={form.luogo} onChange={(event) => setForm({ ...form, luogo: event.target.value })} autoComplete="off" /></label>
            <label><span>Telefono *</span><input type="tel" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} autoComplete="off" /></label>
            <label><span>Email *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="off" /></label>
            <label className="is-wide"><span>Residenza / indirizzo completo *</span><input value={form.residenza} onChange={(event) => setForm({ ...form, residenza: event.target.value })} placeholder="Via, numero civico, CAP, Comune" autoComplete="off" /></label>
          </div>

          {ocrConfidence != null ? (
            <div className="membership-ocr-confidence"><FileScan size={18} /><span><strong>OCR: {ocrConfidence}%</strong><small>L’OCR serve solo a velocizzare la compilazione: i dati vengono salvati soltanto dopo il controllo umano e la firma.</small></span></div>
          ) : null}

          <div className="membership-stage__actions">
            <button type="button" className="membership-button membership-button--secondary" onClick={() => setStep(1)}>Indietro</button>
            <button type="button" className="membership-button membership-button--primary" disabled={!formComplete} onClick={() => setStep(3)}>Passa il tablet al cliente <ArrowRight size={18} /></button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="membership-stage membership-stage--client">
          <div className="membership-client-banner"><ShieldCheck size={26} /><div><span>Modalità cliente</span><strong>Controlla i dati e firma</strong><small>La segretaria può girare ora il tablet verso il corsista.</small></div></div>

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
            <label><input type="checkbox" checked={consents.data_confirmed} onChange={(event) => setConsents({ ...consents, data_confirmed: event.target.checked })} /><span><strong>Confermo che i dati sopra indicati sono corretti.</strong><small>Se qualcosa non è corretto, torna indietro prima di firmare.</small></span></label>
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
