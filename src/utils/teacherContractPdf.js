import { jsPDF } from 'jspdf'

const BRAND = [203, 35, 149]
const BRAND_DARK = [104, 45, 160]
const INK = [19, 31, 54]
const MUTED = [96, 112, 137]
const LINE = [226, 229, 238]
const SOFT = [250, 247, 255]

function value(input, fallback = '') {
  const normalized = String(input ?? '').trim()
  return normalized || fallback
}

function formatDateIt(input) {
  if (!input) return '________________'
  const [year, month, day] = String(input).slice(0, 10).split('-')
  if (!year || !month || !day) return String(input)
  return `${day}/${month}/${year}`
}

function safeFileName(input) {
  return value(input, 'insegnante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function money(input) {
  const amount = Number(input || 0)
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)
}

function compensationDescription(teacher = {}, contract = {}) {
  if (value(contract.compensation_description)) return value(contract.compensation_description)

  if (teacher.payment_type === 'fisso') {
    return `quota fissa mensile pari a ${money(teacher.fixed_monthly_compensation)}`
  }
  if (teacher.payment_type === 'orario') {
    return `compenso orario pari a ${money(teacher.hourly_rate)} per ogni ora effettivamente svolta e documentata`
  }
  return `compenso pari al ${Number(teacher.percentage_compensation || 0)}% delle quote effettivamente incassate e riferibili ai corsi assegnati`
}

function residenceLine(teacher = {}) {
  const location = [teacher.residence_postal_code, teacher.residence_city, teacher.residence_province ? `(${teacher.residence_province})` : '']
    .filter(Boolean)
    .join(' ')
  return [teacher.residence_address, location].filter(Boolean).join(', ') || '____________________________'
}

function teacherBirthLine(teacher = {}) {
  const birthPlace = [teacher.birth_place, teacher.birth_province ? `(${teacher.birth_province})` : '']
    .filter(Boolean)
    .join(' ')
  return `${birthPlace || '________________'} il ${formatDateIt(teacher.birth_date)}`
}

async function imageUrlToDataUrl(src) {
  try {
    const response = await fetch(src)
    if (!response.ok) return ''
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

function createWriter(doc, logoDataUrl = '') {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 18
  const contentWidth = pageWidth - marginX * 2
  let y = 21

  function header() {
    doc.setFillColor(...SOFT)
    doc.rect(0, 0, pageWidth, 27, 'F')
    doc.setFillColor(...BRAND)
    doc.rect(0, 0, 4, 27, 'F')

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', marginX, 5, 17, 17, undefined, 'FAST')
      } catch {
        // Il PDF resta generabile anche se il browser non riesce a caricare il logo.
      }
    }

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.setFontSize(12)
    doc.text('CLUB ORCHIDEA ASD', logoDataUrl ? 39 : marginX, 11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.setFontSize(8.5)
    doc.text('Contratto di collaborazione sportiva - Documento generato da Nova', logoDataUrl ? 39 : marginX, 17)
    doc.setDrawColor(...LINE)
    doc.line(marginX, 26, pageWidth - marginX, 26)
    y = 34
  }

  function footer() {
    const pageNumber = doc.internal.getNumberOfPages()
    doc.setDrawColor(...LINE)
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.setFontSize(7.5)
    doc.text('Club Orchidea ASD - modello gestionale da verificare prima della sottoscrizione', marginX, pageHeight - 8)
    doc.text(`Pagina ${pageNumber}`, pageWidth - marginX, pageHeight - 8, { align: 'right' })
  }

  function newPage() {
    footer()
    doc.addPage()
    header()
  }

  function ensureSpace(height = 25) {
    if (y + height > pageHeight - 20) newPage()
  }

  function paragraph(text, options = {}) {
    const {
      fontSize = 9.4,
      bold = false,
      color = INK,
      gapAfter = 3.5,
      indent = 0,
      lineHeight = 1.32,
    } = options
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    doc.setFontSize(fontSize)
    const lines = doc.splitTextToSize(value(text, '-'), contentWidth - indent)
    const height = lines.length * fontSize * 0.3528 * lineHeight
    ensureSpace(height + gapAfter)
    doc.text(lines, marginX + indent, y)
    y += height + gapAfter
  }

  function heading(text, options = {}) {
    const { size = 11.5, gapBefore = 2.5, gapAfter = 2.5 } = options
    ensureSpace(15)
    y += gapBefore
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_DARK)
    doc.setFontSize(size)
    doc.text(text, marginX, y)
    y += size * 0.42 + gapAfter
  }

  function article(number, title, text) {
    ensureSpace(24)
    doc.setFillColor(...SOFT)
    doc.roundedRect(marginX, y - 4.2, contentWidth, 8.5, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_DARK)
    doc.setFontSize(10.2)
    doc.text(`Art. ${number} - ${title}`, marginX + 3, y + 1.2)
    y += 9.5
    paragraph(text, { fontSize: 9.2, gapAfter: 4.2 })
  }

  function keyValue(label, text, options = {}) {
    const { labelWidth = 39 } = options
    ensureSpace(9)
    doc.setFontSize(9.4)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(label, marginX, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(value(text, '________________'), contentWidth - labelWidth)
    doc.text(lines, marginX + labelWidth, y)
    y += Math.max(6, lines.length * 4.4)
  }

  function signatureBlock(place, date) {
    ensureSpace(58)
    y += 4
    paragraph(`Letto, confermato e sottoscritto a ${value(place, '________________')} in data ${formatDateIt(date)}.`, { bold: true, gapAfter: 11 })
    const colWidth = (contentWidth - 18) / 2
    const leftX = marginX
    const rightX = marginX + colWidth + 18

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...INK)
    doc.text('Il Committente / Club Orchidea ASD', leftX + colWidth / 2, y, { align: 'center' })
    doc.text('Il Collaboratore', rightX + colWidth / 2, y, { align: 'center' })
    y += 24
    doc.setDrawColor(...MUTED)
    doc.line(leftX, y, leftX + colWidth, y)
    doc.line(rightX, y, rightX + colWidth, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.setFontSize(8)
    doc.text('firma e timbro', leftX + colWidth / 2, y + 5, { align: 'center' })
    doc.text('firma', rightX + colWidth / 2, y + 5, { align: 'center' })
    y += 12
  }

  header()
  return { paragraph, heading, article, keyValue, signatureBlock, finish: footer, pageWidth, pageHeight, marginX, contentWidth, getY: () => y, setY: (nextY) => { y = nextY } }
}

export function createTeacherContractDocument({ teacher = {}, contract = {}, courses = [], logoDataUrl = '' } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({
    title: `Contratto Co.Co.Co. - ${value(teacher.full_name, 'Insegnante')}`,
    subject: 'Contratto di collaborazione coordinata e continuativa per lavoro sportivo',
    author: 'Club Orchidea ASD - Nova Gestionale',
    creator: 'Nova Gestionale ASD',
  })

  const writer = createWriter(doc, logoDataUrl)
  const { paragraph, heading, article, keyValue, signatureBlock } = writer
  const organization = {
    name: value(contract.organization_name, 'Club Orchidea ASD'),
    address: value(contract.organization_address, 'Via Giuseppe Ungaretti 34'),
    city: value(contract.organization_city, 'Saronno (VA)'),
    taxCode: value(contract.organization_tax_code, '14275140961'),
    rasd: value(contract.organization_rasd, '31102195'),
    affiliation: value(contract.organization_affiliation, 'OPES'),
    representative: value(contract.organization_representative, 'Manuel Ledonne'),
  }

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.setFontSize(17)
  doc.text('CONTRATTO DI COLLABORAZIONE COORDINATA', doc.internal.pageSize.getWidth() / 2, 39, { align: 'center' })
  doc.text('E CONTINUATIVA PER LAVORO SPORTIVO', doc.internal.pageSize.getWidth() / 2, 46, { align: 'center' })
  doc.setTextColor(...BRAND_DARK)
  doc.setFontSize(13)
  doc.text('(CO.CO.CO.)', doc.internal.pageSize.getWidth() / 2, 53, { align: 'center' })
  writer.setY(63)

  heading('Parti del contratto', { size: 12.5 })
  paragraph(`Tra ${organization.name}, con sede in ${organization.city}, ${organization.address}, C.F./P.IVA ${organization.taxCode}, iscritta al RASD n. ${organization.rasd}, affiliata ${organization.affiliation}, nella persona del Presidente/Legale Rappresentante ${organization.representative}, di seguito "Committente";`, { gapAfter: 5 })
  paragraph(`e Sig./Sig.ra ${value(teacher.full_name, '____________________________')}, nato/a a ${teacherBirthLine(teacher)}, C.F. ${value(teacher.tax_code, '________________')}, residente in ${residenceLine(teacher)}, e-mail ${value(teacher.email, '________________')}, tel. ${value(teacher.phone, '________________')}, di seguito "Collaboratore".`, { gapAfter: 6 })

  heading('Premesse')
  paragraph(`1. Il Committente svolge attivita sportiva dilettantistica ed e regolarmente iscritto al RASD. 2. Il Collaboratore dichiara di possedere le competenze e, ove richiesto, le qualifiche tecniche necessarie per svolgere l'attivita nella disciplina ${value(contract.discipline, '________________')}. 3. Le premesse costituiscono parte integrante del presente contratto.`)

  article(1, 'Natura del rapporto', `Il presente rapporto ha natura di collaborazione coordinata e continuativa di lavoro sportivo, con esclusione di ogni vincolo di subordinazione. Il Collaboratore organizza autonomamente la propria prestazione nel rispetto del coordinamento concordato con il Committente, degli obiettivi tecnici e della programmazione dell'associazione.`)

  article(2, "Oggetto dell'incarico", `Il Committente conferisce al Collaboratore l'incarico di svolgere l'attivita di ${value(contract.role, 'Istruttore/Allenatore')} nella disciplina ${value(contract.discipline, '________________')}. Sede di svolgimento: ${value(contract.venue, `${organization.name}, ${organization.address}, ${organization.city}`)}. Mansioni principali: ${value(contract.duties, 'lezioni, preparazione tecnica e coreografica, assistenza agli allievi e attivita connesse')}.`)

  article(3, 'Durata', `Il contratto decorre dal ${formatDateIt(contract.start_date)} e termina il ${formatDateIt(contract.end_date)}, salvo rinnovo o proroga in forma scritta. Ciascuna parte puo recedere con preavviso di ${value(contract.notice_days, '15')} giorni, salvo giusta causa e fatti che legittimino la risoluzione immediata.`)

  article(4, 'Modalita di svolgimento e coordinamento', `Coordinamento indicativo, modificabile di comune accordo: giorni/turni ${value(contract.days_turns, 'da concordare')}; fasce orarie ${value(contract.time_slots, 'da concordare')}; ore settimanali/mensili stimate ${value(contract.estimated_hours, 'da definire')}. Il Collaboratore rispetta i regolamenti interni, le norme di sicurezza e le disposizioni dell'organismo di affiliazione.`)

  article(5, 'Compenso e pagamenti', `Il compenso e determinato come segue: ${compensationDescription(teacher, contract)}. Il valore indicato si intende ${value(contract.compensation_tax, 'lordo')} e viene liquidato con periodicita ${value(contract.compensation_frequency, 'mensile')}, previa verifica delle prestazioni e degli importi maturati. Pagamento mediante bonifico su IBAN ${value(teacher.iban, '____________________________')}, intestato a ${value(teacher.bank_account_holder, teacher.full_name || '________________')}. Eventuali rimborsi spese sono riconosciuti soltanto se preventivamente autorizzati e adeguatamente documentati.`)

  article(6, 'Obblighi del Collaboratore', `Il Collaboratore si impegna a: a) svolgere l'attivita con diligenza, professionalita e continuita; b) mantenere un comportamento conforme ai principi di lealta sportiva e ai regolamenti dell'ente di affiliazione; c) comunicare tempestivamente impedimenti o assenze; d) rispettare la riservatezza sui dati personali, sui materiali e sulle informazioni del Committente; e) comunicare gli ulteriori rapporti sportivi e le informazioni necessarie agli adempimenti di legge.`)

  article(7, 'Obblighi del Committente', `Il Committente si impegna a: a) mettere a disposizione gli spazi e le attrezzature previste; b) corrispondere il compenso nei termini concordati; c) effettuare le comunicazioni e gli adempimenti previsti dalla disciplina del lavoro sportivo e dal Registro nazionale delle attivita sportive dilettantistiche; d) fornire le informazioni utili allo svolgimento sicuro dell'incarico.`)

  article(8, 'Trattamento fiscale, contributivo e assicurativo', `Il rapporto e gestito secondo la disciplina vigente in materia di lavoro sportivo dilettantistico. Il Collaboratore fornisce al Committente dichiarazioni e informazioni complete e aggiornate ai fini fiscali, previdenziali, assicurativi e delle comunicazioni obbligatorie, inclusi eventuali altri rapporti e compensi sportivi percepiti.`)

  article(9, 'Incompatibilita e conflitto di interessi', `Il Collaboratore comunica tempestivamente eventuali situazioni di conflitto di interessi o concorrenza diretta e non utilizza dati, materiali, marchi o informazioni del Committente per finalita non autorizzate.`)

  article(10, 'Risoluzione', `Il contratto puo essere risolto con effetto immediato in caso di grave inadempimento, violazione delle norme di sicurezza o dei regolamenti sportivi, comportamento lesivo dell'immagine dell'associazione o perdita dei requisiti necessari allo svolgimento dell'incarico. Restano dovuti i compensi maturati per le prestazioni regolarmente eseguite e documentate.`)

  article(11, 'Privacy', `I dati personali sono trattati esclusivamente per la gestione del rapporto, l'adempimento degli obblighi di legge e la tutela dei diritti delle parti, nel rispetto del Regolamento UE 2016/679 e della normativa nazionale applicabile. Il Collaboratore dichiara di avere ricevuto o di ricevere separata informativa sul trattamento dei dati personali.`)

  article(12, 'Foro competente e rinvio', `Per ogni controversia e competente il foro indicato dalle norme inderogabili applicabili${value(contract.competent_court) ? ` e, ove validamente consentito, il Foro di ${value(contract.competent_court)}` : ''}. Per quanto non disciplinato dal presente contratto si rinvia alla normativa vigente, ai regolamenti sportivi applicabili e agli accordi scritti tra le parti.`)

  heading('Dati operativi riepilogativi')
  keyValue('Corsi collegati:', courses.length ? courses.map((course) => course.nome).filter(Boolean).join(', ') : 'Nessun corso collegato al momento della generazione')
  keyValue('Disciplina:', contract.discipline)
  keyValue('Periodo:', `${formatDateIt(contract.start_date)} - ${formatDateIt(contract.end_date)}`)
  keyValue('Compenso:', compensationDescription(teacher, contract))
  keyValue('IBAN:', teacher.iban)
  signatureBlock(contract.signing_place, contract.signing_date)

  writer.finish()
  return doc
}

export async function generateTeacherContractPdf(input = {}) {
  const logoDataUrl = input.logoDataUrl || await imageUrlToDataUrl('/orchidea.png')
  const doc = createTeacherContractDocument({ ...input, logoDataUrl })
  const filename = `Contratto_CoCoCo_${safeFileName(input.teacher?.full_name)}_${String(input.contract?.start_date || '').slice(0, 4) || 'stagione'}.pdf`
  doc.save(filename)
  return filename
}
