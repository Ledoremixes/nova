import { useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  GraduationCap,
  Lightbulb,
  MessageCircleQuestion,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { ModuleEmpty, ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

const tutorials = [
  {
    id: 'tut-tesserati',
    title: 'Gestire tesserati e corsisti',
    category: 'Anagrafiche',
    duration: '5 min',
    level: 'Base',
    description: 'Ricerca, aggiorna e controlla rapidamente lo stato degli iscritti.',
    steps: ['Apri la sezione Tesserati dalla barra laterale.', 'Usa ricerca e filtri per trovare la persona.', 'Apri la scheda per verificare dati, tessera e corsi.', 'Salva le modifiche e controlla lo stato aggiornato.'],
  },
  {
    id: 'tut-payments',
    title: 'Registrare un pagamento',
    category: 'Pagamenti',
    duration: '4 min',
    level: 'Base',
    description: 'Assegna corsi e pacchetti e registra correttamente una quota.',
    steps: ['Apri Pagamenti e cerca l’allievo.', 'Seleziona il corso o il pacchetto acquistato.', 'Controlla importo, periodo e metodo di pagamento.', 'Conferma la registrazione e verifica il riepilogo.'],
  },
  {
    id: 'tut-event',
    title: 'Pianificare un evento',
    category: 'Eventi',
    duration: '6 min',
    level: 'Intermedio',
    description: 'Organizza una serata con capienza, budget, presenze e incassi.',
    steps: ['Apri Gestione eventi e premi “Crea evento”.', 'Inserisci data, orari, luogo e categoria.', 'Definisci capienza e budget iniziale.', 'Aggiorna iscritti e incasso durante la promozione.', 'Porta lo stato su Completato dopo la chiusura.'],
  },
  {
    id: 'tut-campaign',
    title: 'Pianificare una campagna',
    category: 'Marketing',
    duration: '7 min',
    level: 'Intermedio',
    description: 'Definisci obiettivi, canali, budget e date della comunicazione.',
    steps: ['Apri Marketing e seleziona “Pianifica campagna”.', 'Scrivi un obiettivo chiaro e misurabile.', 'Scegli canali, date e responsabile.', 'Imposta budget e obiettivo lead.', 'Aggiorna spesa e risultati durante la campagna.'],
  },
  {
    id: 'tut-accounting',
    title: 'Controllare la contabilità',
    category: 'Contabilità',
    duration: '8 min',
    level: 'Avanzato',
    description: 'Leggi i dati economici e prepara i riepiloghi in modo ordinato.',
    steps: ['Apri Contabilità e scegli il periodo.', 'Verifica classificazioni e movimenti anomali.', 'Confronta entrate, uscite e saldo.', 'Esporta il prospetto necessario dalla sezione dedicata.'],
  },
  {
    id: 'tut-audit',
    title: 'Leggere il registro Audit',
    category: 'Sicurezza',
    duration: '3 min',
    level: 'Base',
    description: 'Filtra le attività e individua rapidamente operazioni importanti.',
    steps: ['Apri Audit dalla barra laterale.', 'Filtra per modulo, livello o periodo.', 'Apri i dettagli dell’operazione che vuoi verificare.', 'Esporta il CSV per conservare una copia del registro.'],
  },
]

const faqs = [
  { question: 'Perché non vedo alcune sezioni?', answer: 'Le sezioni amministrative sono visibili solo agli utenti con ruolo Admin. Controlla il ruolo dalla pagina Utenti.' },
  { question: 'Dove trovo le campagne nel calendario?', answer: 'Ogni campagna compare automaticamente nel Calendario alla sua data di inizio, insieme agli eventi e agli appuntamenti.' },
  { question: 'Come controllo le scorte basse?', answer: 'Nello Shop trovi un indicatore nelle statistiche e un avviso direttamente sulle schede dei prodotti sotto la soglia impostata.' },
  { question: 'Posso esportare il registro attività?', answer: 'Sì. Nella pagina Audit usa il pulsante “Esporta CSV” per scaricare il risultato dei filtri correnti.' },
]

export default function GuidaTutorialPage() {
  const { data, commit } = useNovaModules()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tutti')
  const [selected, setSelected] = useState(null)
  const [openFaq, setOpenFaq] = useState(0)

  const categories = ['Tutti', ...new Set(tutorials.map((item) => item.category))]
  const filtered = useMemo(() => tutorials
    .filter((item) => category === 'Tutti' || item.category === category)
    .filter((item) => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [category, search])
  const completed = data.completedTutorials || []
  const progress = Math.round((completed.length / tutorials.length) * 100)

  function markComplete(tutorial) {
    if (completed.includes(tutorial.id)) return
    commit(
      (current) => ({ ...current, completedTutorials: [...current.completedTutorials, tutorial.id] }),
      { action: 'Tutorial completato', module: 'Guida', detail: tutorial.title, severity: 'Successo' }
    )
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Centro assistenza Nova"
        title="Guida e tutorial"
        description="Impara a usare ogni area del gestionale con guide brevi, passaggi chiari e risposte immediate."
        icon={GraduationCap}
      >
        <label className="guide-hero-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cosa vuoi imparare?" /></label>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Guide disponibili" value={tutorials.length} caption="Percorsi operativi" icon={BookOpen} />
        <ModuleMetric label="Completate" value={completed.length} caption={`${progress}% del percorso`} icon={CheckCircle2} tone="green" />
        <ModuleMetric label="Tempo totale" value="33 min" caption="Per conoscere le funzioni principali" icon={Clock3} tone="blue" />
        <ModuleMetric label="Livelli" value="3" caption="Base, intermedio e avanzato" icon={Sparkles} tone="pink" />
      </div>

      <div className="page-card module-card guide-progress-card">
        <div><span className="module-badge is-success"><Check size={15} /> Percorso personale</span><h3>Continua a scoprire Nova</h3><p>Hai completato {completed.length} tutorial su {tutorials.length}.</p></div>
        <div className="guide-progress-card__value"><strong>{progress}%</strong><div className="module-progress"><i style={{ width: `${progress}%` }} /></div></div>
      </div>

      <div className="guide-layout">
        <div className="page-card module-card">
          <div className="section-head"><div><h3>Tutorial operativi</h3><p>Scegli un argomento e segui i passaggi.</p></div></div>
          <div className="guide-categories">{categories.map((item) => <button type="button" key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
          {filtered.length ? <div className="tutorial-grid">{filtered.map((tutorial) => {
            const isComplete = completed.includes(tutorial.id)
            return <button className="tutorial-card" type="button" key={tutorial.id} onClick={() => setSelected(tutorial)}>
              <span className={`tutorial-card__icon ${isComplete ? 'is-complete' : ''}`}>{isComplete ? <Check size={21} /> : <Play size={21} />}</span>
              <span className="tutorial-card__content"><span className="tutorial-card__meta"><small>{tutorial.category}</small><small>{tutorial.duration}</small></span><strong>{tutorial.title}</strong><p>{tutorial.description}</p><span className="tutorial-card__footer"><em className={`module-badge ${tutorial.level === 'Avanzato' ? 'is-warning' : tutorial.level === 'Intermedio' ? 'is-blue' : 'is-neutral'}`}>{tutorial.level}</em><em>{isComplete ? 'Completato' : 'Inizia'} →</em></span></span>
            </button>
          })}</div> : <ModuleEmpty icon={Search} title="Nessun tutorial trovato" text="Prova una ricerca diversa o cambia categoria." />}
        </div>

        <aside className="guide-side">
          <div className="page-card module-card guide-tip"><span><Lightbulb size={23} /></span><h3>Consiglio rapido</h3><p>Usa il Calendario come centro operativo: eventi e campagne pianificate vengono mostrati automaticamente.</p></div>
          <div className="page-card module-card"><div className="section-head"><div><h3>Domande frequenti</h3><p>Risposte alle richieste più comuni.</p></div><CircleHelp size={23} /></div><div className="faq-list">{faqs.map((item, index) => <div className={`faq-item ${openFaq === index ? 'is-open' : ''}`} key={item.question}><button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)}><span>{item.question}</span><ChevronDown size={17} /></button>{openFaq === index ? <p>{item.answer}</p> : null}</div>)}</div></div>
          <div className="page-card module-card guide-support"><MessageCircleQuestion size={26} /><div><h3>Serve ancora aiuto?</h3><p>Raccogli schermata, pagina interessata e descrizione del problema prima di contattare l’assistenza.</p></div></div>
        </aside>
      </div>

      <ModuleModal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} subtitle={selected ? `${selected.category} · ${selected.duration} · ${selected.level}` : ''} icon={BookOpen}>
        {selected ? <div className="tutorial-detail"><p>{selected.description}</p><div className="tutorial-steps">{selected.steps.map((step, index) => <div key={step}><span>{index + 1}</span><p>{step}</p></div>)}</div><div className="module-form__actions"><button type="button" className="module-button" onClick={() => setSelected(null)}>Chiudi</button><button type="button" disabled={completed.includes(selected.id)} className="module-button module-button--primary" onClick={() => markComplete(selected)}>{completed.includes(selected.id) ? <><ShieldCheck size={16} /> Completato</> : <><Check size={16} /> Segna come completato</>}</button></div></div> : null}
      </ModuleModal>
    </section>
  )
}
