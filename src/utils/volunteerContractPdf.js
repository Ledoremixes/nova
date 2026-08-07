import { jsPDF } from 'jspdf'

const BRAND = [203, 35, 149]
const BRAND_DARK = [104, 45, 160]
const INK = [19, 31, 54]
const MUTED = [96, 112, 137]
const LINE = [226, 229, 238]
const SOFT = [250, 247, 255]

function val(input, fallback = '') {
  const out = String(input ?? '').trim()
  return out || fallback
}
function dateIt(input) {
  if (!input) return '________________'
  const [y, m, d] = String(input).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(input)
}
function filename(input) {
  return val(input, 'volontario').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_')
}
async function imageData(src) {
  try {
    const r = await fetch(src)
    if (!r.ok) return ''
    const blob = await r.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch { return '' }
}
function residence(v) {
  const city = [v.residence_postal_code, v.residence_city, v.residence_province ? `(${v.residence_province})` : ''].filter(Boolean).join(' ')
  return [v.residence_address, city].filter(Boolean).join(', ') || '____________________________'
}
function roleLabel(role) {
  const map = { barman: 'Barman', cameriere: 'Cameriere', barlady: 'Barlady', ballerino: 'Ballerino', animatore: 'Animatore', videomaker: 'Videomaker', fotografo: 'Fotografo' }
  return map[role] || val(role, 'Volontario sportivo')
}

async function buildVolunteerContractPdf(volunteer, settings = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await imageData('/orchidea.png')
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const mx = 18
  const cw = W - mx * 2
  let y = 34

  function header() {
    doc.setFillColor(...SOFT); doc.rect(0, 0, W, 28, 'F')
    doc.setFillColor(...BRAND); doc.rect(0, 0, 4, 28, 'F')
    if (logo) { try { doc.addImage(logo, 'PNG', mx, 5, 17, 17, undefined, 'FAST') } catch {} }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.setFontSize(12)
    doc.text('CLUB ORCHIDEA ASD', logo ? 39 : mx, 11)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.setFontSize(8.5)
    doc.text('Accordo di volontariato sportivo - Documento generato da Nova', logo ? 39 : mx, 17)
    doc.setDrawColor(...LINE); doc.line(mx, 27, W - mx, 27)
    y = 35
  }
  function footer() {
    doc.setDrawColor(...LINE); doc.line(mx, H - 14, W - mx, H - 14)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.setFontSize(7.5)
    doc.text('Club Orchidea ASD - accordo da verificare prima della sottoscrizione', mx, H - 8)
    doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, W - mx, H - 8, { align: 'right' })
  }
  function newPage() { footer(); doc.addPage(); header() }
  function ensure(h = 20) { if (y + h > H - 20) newPage() }
  function paragraph(text, { bold = false, size = 9.3, gap = 3.5 } = {}) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...INK); doc.setFontSize(size)
    const lines = doc.splitTextToSize(val(text, '-'), cw)
    const h = lines.length * size * 0.47
    ensure(h + gap); doc.text(lines, mx, y); y += h + gap
  }
  function title(text) {
    ensure(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND_DARK); doc.setFontSize(16)
    doc.text(text, W / 2, y, { align: 'center' }); y += 10
  }
  function article(n, heading, body) {
    ensure(25)
    doc.setFillColor(...SOFT); doc.roundedRect(mx, y - 4, cw, 8.5, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...BRAND_DARK); doc.setFontSize(10)
    doc.text(`${n}. ${heading}`, mx + 3, y + 1.2); y += 10
    paragraph(body, { size: 9.1, gap: 4.2 })
  }

  header(); title('ACCORDO DI VOLONTARIATO SPORTIVO')
  paragraph('TRA', { bold: true })
  paragraph(`${val(settings.organization_name, 'CLUB ORCHIDEA ASD')}, con sede legale in ${val(settings.organization_legal_address, 'Limbiate (MB), Via Giotto 56A')}, codice fiscale ${val(settings.organization_tax_code, '14275140961')}, nella persona del Presidente e legale rappresentante ${val(settings.organization_representative, 'Manuel Ledonne')}, di seguito “Associazione”;`)
  paragraph('E', { bold: true })
  paragraph(`${val(volunteer.full_name, '________________')}, nato/a a ${val(volunteer.birth_place, '________________')}${volunteer.birth_province ? ` (${volunteer.birth_province})` : ''} il ${dateIt(volunteer.birth_date)}, codice fiscale ${val(volunteer.tax_code, '________________')}, residente in ${residence(volunteer)}, di seguito “Volontario”.`)
  paragraph('PREMESSO CHE', { bold: true })
  paragraph('l’Associazione è un ente sportivo dilettantistico senza finalità lucrative e il Volontario intende offrire spontaneamente e gratuitamente la propria collaborazione, condividendone le finalità istituzionali e sportive.')
  paragraph('Tutto ciò premesso, le parti convengono e stipulano quanto segue.', { bold: true })

  const roles = [roleLabel(volunteer.role), ...(volunteer.additional_roles || []).map(roleLabel)].filter(Boolean)
  const activities = val(volunteer.duties) || `Attività connesse al ruolo di ${roles.join(', ') || 'volontario sportivo'}.`
  article(1, 'Premesse', 'Le premesse costituiscono parte integrante e sostanziale del presente accordo.')
  article(2, 'Oggetto dell’attività volontaria', `Il Volontario presta la propria opera personalmente, spontaneamente e gratuitamente nel ruolo di ${roles.join(', ')}. Attività assegnate: ${activities}`)
  article(3, 'Gratuità della prestazione', 'La collaborazione è resa per fini solidaristici e senza scopo di lucro. Non è previsto alcun compenso, remunerazione, indennità o trattamento previdenziale e assistenziale. Restano possibili esclusivamente rimborsi di spese effettivamente sostenute, documentate e preventivamente autorizzate, nei limiti consentiti dalla normativa applicabile.')
  article(4, 'Luogo e modalità di svolgimento', `L’attività si svolge presso ${val(volunteer.venue, 'Club Orchidea ASD - Via Giuseppe Ungaretti 34, Saronno (VA)')} e negli eventuali luoghi connessi alle iniziative dell’Associazione, secondo modalità concordate paritariamente e nel rispetto delle regole interne e di sicurezza.`)
  article(5, 'Durata', `L’accordo decorre dal ${dateIt(volunteer.contract_start_date)} e termina il ${dateIt(volunteer.contract_end_date)}, salvo rinnovo scritto. Ciascuna parte può recedere con un preavviso di almeno ${Number(volunteer.notice_days || 15)} giorni, mediante comunicazione scritta con ricevimento dimostrabile.`)
  article(6, 'Obblighi dell’Associazione', 'L’Associazione mette a disposizione spazi, strumenti e indicazioni necessarie allo svolgimento dell’attività e garantisce, ove richiesto dalla disciplina applicabile, idonea copertura assicurativa tramite l’organismo sportivo di affiliazione o altra copertura prevista.')
  article(7, 'Obblighi del Volontario', 'Il Volontario opera con diligenza, correttezza e buona fede, comunica tempestivamente impedimenti o assenze, rispetta le norme di sicurezza, tutela la riservatezza dei dati e non utilizza beni o informazioni dell’Associazione per finalità non autorizzate.')
  article(8, 'Assenza di subordinazione', 'L’attività volontaria non costituisce rapporto di lavoro subordinato, autonomo o di collaborazione remunerata e non genera alcun diritto alla stabilizzazione o all’assunzione.')
  article(9, 'Privacy', 'I dati personali sono trattati esclusivamente per la gestione del rapporto di volontariato, della copertura assicurativa e degli obblighi previsti dalla legge, nel rispetto del Regolamento UE 2016/679 e della normativa nazionale applicabile.')
  article(10, 'Controversie e rinvio', 'Le parti si impegnano a esperire preliminarmente un tentativo di composizione bonaria o mediazione. Per quanto non espressamente previsto si applicano le norme vigenti, in quanto compatibili.')

  ensure(58); y += 3
  paragraph(`Letto, approvato e sottoscritto a ${val(volunteer.signing_place, 'Saronno')} in data ____/____/________.`, { bold: true, gap: 12 })
  const col = (cw - 18) / 2; const rx = mx + col + 18
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.setFontSize(9.5)
  doc.text('L’Associazione', mx + col / 2, y, { align: 'center' }); doc.text('Il Volontario', rx + col / 2, y, { align: 'center' })
  y += 24; doc.setDrawColor(...MUTED); doc.line(mx, y, mx + col, y); doc.line(rx, y, rx + col, y)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.setFontSize(8)
  doc.text('firma e timbro', mx + col / 2, y + 5, { align: 'center' }); doc.text('firma', rx + col / 2, y + 5, { align: 'center' })
  footer()
  return doc
}

export function volunteerContractFilename(volunteer) {
  return `Contratto_volontariato_${filename(volunteer?.full_name)}_${String(volunteer?.contract_start_date || '').slice(0, 4)}.pdf`
}

export async function createVolunteerContractPdfBlob(volunteer, settings = {}) {
  const doc = await buildVolunteerContractPdf(volunteer, settings)
  return doc.output('blob')
}

export async function generateVolunteerContractPdf(volunteer, settings = {}) {
  const doc = await buildVolunteerContractPdf(volunteer, settings)
  doc.save(volunteerContractFilename(volunteer))
}
