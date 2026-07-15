const STORAGE_KEY = 'nova-modules-v1'
const UPDATE_EVENT = 'nova-modules:updated'

const initialData = {
  calendarItems: [
    {
      id: 'cal-team-brief',
      title: 'Brief operativo del team',
      date: '2026-07-16',
      time: '18:30',
      type: 'Riunione',
      location: 'Ufficio Orchidea',
      notes: 'Allineamento su eventi estivi e attività promozionali.',
    },
    {
      id: 'cal-siae',
      title: 'Scadenza pratica SIAE',
      date: '2026-07-20',
      time: '10:00',
      type: 'Scadenza',
      location: 'Online',
      notes: 'Verificare documentazione e ricevute prima dell’invio.',
    },
    {
      id: 'cal-content',
      title: 'Produzione contenuti social',
      date: '2026-07-23',
      time: '15:00',
      type: 'Marketing',
      location: 'Sala principale',
      notes: 'Foto e video per il lancio della nuova stagione.',
    },
  ],
  events: [
    {
      id: 'evt-summer-latin',
      title: 'Summer Latin Night',
      category: 'Serata latina',
      date: '2026-07-18',
      startTime: '21:30',
      endTime: '02:00',
      venue: 'Orchidea Summer',
      status: 'Confermato',
      capacity: 350,
      registered: 184,
      budget: 1200,
      revenue: 2392,
      description: 'Serata estiva con animazione, stage e social dance.',
    },
    {
      id: 'evt-open-week',
      title: 'Open Week 2026/27',
      category: 'Open day',
      date: '2026-09-07',
      startTime: '19:30',
      endTime: '23:00',
      venue: 'Orchidea Dancing Club',
      status: 'Pianificato',
      capacity: 300,
      registered: 96,
      budget: 850,
      revenue: 0,
      description: 'Prima giornata delle settimane di prova gratuita.',
    },
    {
      id: 'evt-opening',
      title: 'Apertura stagione 2026/27',
      category: 'Evento speciale',
      date: '2026-09-12',
      startTime: '21:30',
      endTime: '03:00',
      venue: 'Orchidea Dancing Club',
      status: 'Pianificato',
      capacity: 500,
      registered: 72,
      budget: 2400,
      revenue: 0,
      description: 'Evento di apertura ufficiale della nuova stagione.',
    },
  ],
  products: [
    {
      id: 'prd-shirt',
      name: 'T-shirt Orchidea',
      sku: 'ORC-TS-001',
      category: 'Abbigliamento',
      price: 22,
      stock: 34,
      lowStock: 8,
      status: 'Attivo',
      color: 'Viola',
    },
    {
      id: 'prd-top',
      name: 'Top Academy',
      sku: 'LMA-TOP-002',
      category: 'Abbigliamento',
      price: 25,
      stock: 7,
      lowStock: 8,
      status: 'Attivo',
      color: 'Nero',
    },
    {
      id: 'prd-bottle',
      name: 'Borraccia Nova',
      sku: 'NVA-BOR-003',
      category: 'Accessori',
      price: 15,
      stock: 18,
      lowStock: 5,
      status: 'Attivo',
      color: 'Bianco',
    },
    {
      id: 'prd-pass',
      name: 'Gift card 4 lezioni',
      sku: 'ORC-GFT-004',
      category: 'Gift card',
      price: 40,
      stock: 999,
      lowStock: 0,
      status: 'Attivo',
      color: 'Digitale',
    },
  ],
  orders: [
    { id: 'ORD-1028', customer: 'Giulia Ferri', date: '2026-07-13', total: 47, items: 2, status: 'Da preparare' },
    { id: 'ORD-1027', customer: 'Marco Riva', date: '2026-07-12', total: 25, items: 1, status: 'Pronto' },
    { id: 'ORD-1026', customer: 'Sara Conti', date: '2026-07-10', total: 40, items: 1, status: 'Consegnato' },
    { id: 'ORD-1025', customer: 'Luca Sala', date: '2026-07-08', total: 37, items: 2, status: 'Consegnato' },
  ],
  campaigns: [
    {
      id: 'cmp-open-week',
      name: 'Open Week – nuova stagione',
      objective: 'Iscrizioni alle prove gratuite',
      channel: 'Instagram + Meta Ads',
      startDate: '2026-07-20',
      endDate: '2026-09-20',
      budget: 900,
      spent: 180,
      status: 'Attiva',
      leads: 96,
      goal: 250,
      owner: 'Laura',
    },
    {
      id: 'cmp-summer',
      name: 'Summer Latin Night',
      objective: 'Vendita ingressi',
      channel: 'Instagram',
      startDate: '2026-07-10',
      endDate: '2026-07-18',
      budget: 180,
      spent: 132,
      status: 'Attiva',
      leads: 184,
      goal: 250,
      owner: 'Manuel',
    },
    {
      id: 'cmp-annual',
      name: 'All You Can Dance',
      objective: 'Promozione abbonamento completo',
      channel: 'Instagram + WhatsApp',
      startDate: '2026-08-20',
      endDate: '2026-10-05',
      budget: 450,
      spent: 0,
      status: 'Pianificata',
      leads: 0,
      goal: 80,
      owner: 'Laura',
    },
    {
      id: 'cmp-country',
      name: 'Country Friday',
      objective: 'Aumentare presenze del venerdì',
      channel: 'Facebook',
      startDate: '2026-09-01',
      endDate: '2026-10-31',
      budget: 250,
      spent: 0,
      status: 'Bozza',
      leads: 0,
      goal: 120,
      owner: 'Team marketing',
    },
  ],
  completedTutorials: ['tut-tesserati'],
  auditLogs: [
    {
      id: 'log-1',
      timestamp: '2026-07-14T08:42:00.000Z',
      action: 'Accesso amministratore',
      module: 'Sicurezza',
      detail: 'Sessione autenticata correttamente.',
      actor: 'Admin Nova',
      severity: 'Info',
    },
    {
      id: 'log-2',
      timestamp: '2026-07-13T16:18:00.000Z',
      action: 'Ordine aggiornato',
      module: 'Shop',
      detail: 'Ordine ORD-1027 impostato come Pronto.',
      actor: 'Admin Nova',
      severity: 'Successo',
    },
    {
      id: 'log-3',
      timestamp: '2026-07-13T09:12:00.000Z',
      action: 'Campagna modificata',
      module: 'Marketing',
      detail: 'Aggiornato il budget della campagna Open Week.',
      actor: 'Admin Nova',
      severity: 'Info',
    },
    {
      id: 'log-4',
      timestamp: '2026-07-12T18:04:00.000Z',
      action: 'Scorta in esaurimento',
      module: 'Shop',
      detail: 'Il prodotto Top Academy ha raggiunto la soglia minima.',
      actor: 'Sistema',
      severity: 'Attenzione',
    },
  ],
}

export function createId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cloneInitialData() {
  return JSON.parse(JSON.stringify(initialData))
}

export function getNovaModulesData() {
  if (typeof window === 'undefined') return cloneInitialData()

  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
    if (!saved || typeof saved !== 'object') return cloneInitialData()

    const defaults = cloneInitialData()
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, Array.isArray(saved[key]) ? saved[key] : value])
    )
  } catch {
    return cloneInitialData()
  }
}

export function updateNovaModulesData(updater, audit) {
  const current = getNovaModulesData()
  const updated = updater(current) || current
  const next = { ...updated }

  if (audit) {
    next.auditLogs = [
      {
        id: createId('log'),
        timestamp: new Date().toISOString(),
        severity: 'Info',
        actor: 'Admin Nova',
        ...audit,
      },
      ...(next.auditLogs || []),
    ].slice(0, 500)
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: next }))
  return next
}

export function subscribeNovaModules(callback) {
  const onCustomUpdate = (event) => callback(event.detail || getNovaModulesData())
  const onStorage = (event) => {
    if (event.key === STORAGE_KEY) callback(getNovaModulesData())
  }

  window.addEventListener(UPDATE_EVENT, onCustomUpdate)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(UPDATE_EVENT, onCustomUpdate)
    window.removeEventListener('storage', onStorage)
  }
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
}

export function formatItalianDate(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', ...options }).format(
    new Date(`${value}T12:00:00`)
  )
}
