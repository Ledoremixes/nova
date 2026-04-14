import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthProvider'
import {
  fetchEntries,
  fetchAccounts,
  createEntry,
  updateEntry,
  deleteEntry,
  fetchEntriesFilteredTotals,
  bulkUpdateEntries,
  euro,
  normalizeNumberInput,
  importSumupEntries,
  fetchLastSumupImport,
} from '../api/entries'

const today = new Date().toISOString().slice(0, 10)

const NATURE_OPTIONS = [
  'Acquisti',
  'Bar',
  'commerciale',
  'Compensi insegnanti',
  'Ingressi serate',
  'istituzionale',
  'Servizi',
  'Tesseramenti',
]

const METHOD_OPTIONS = [
  'American Express',
  'American Express - Carta di credito',
  'Bonifico',
  'Carta',
  'Carta non assegnata',
  'Contanti',
  'Maestro - Carta di debito',
  'Mastercard',
  'Mastercard - Carta di credito',
  'Mastercard - Carta di debito',
  'Mastercard - Prepagata',
  'POS',
  'Visa',
  'Visa - Carta di credito',
  'Visa - Carta di debito',
  'Visa - Prepagata',
  'Visa V-Pay - Carta di debito',
]

const CENTER_OPTIONS = ['Bar', 'Sheet0']
const VAT_RATE_OPTIONS = ['0.00', '10.00', '22.00', '22.01']

const emptyForm = {
  date: today,
  description: '',
  amount_in: '',
  amount_out: '',
  account_code: '',
  method: '',
  center: '',
  nature: '',
  vat_mode: 'none',
  vat_rate: '',
  vat_amount: '',
  note: '',
}

function parseItalianDateTimeToStrings(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null

  const [datePart, timePartRaw] = dateStr.split(',')
  if (!datePart) return null

  const parts = datePart.trim().split(' ')
  if (parts.length < 3) return null

  const day = parseInt(parts[0], 10)
  const monthShort = parts[1].toLowerCase().slice(0, 3)
  const year = parseInt(parts[2], 10)

  const months = {
    gen: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    mag: 5,
    giu: 6,
    lug: 7,
    ago: 8,
    set: 9,
    ott: 10,
    nov: 11,
    dic: 12,
  }

  const month = months[monthShort]
  if (!month || !day || !year) return null

  let hours = 0
  let minutes = 0
  if (timePartRaw) {
    const [h, m] = timePartRaw.trim().split(':')
    hours = parseInt(h, 10) || 0
    minutes = parseInt(m, 10) || 0
  }

  const pad = (n) => String(n).padStart(2, '0')
  const date = `${year}-${pad(month)}-${pad(day)}`
  const datetime = `${date}T${pad(hours)}:${pad(minutes)}:00`

  return { date, datetime }
}

function parseVatRate(vatRateRaw) {
  if (vatRateRaw === null || vatRateRaw === undefined || vatRateRaw === '') return null

  const cleaned = String(vatRateRaw).replace('%', '').replace(',', '.').trim()
  const parsedRate = Number(cleaned)
  if (Number.isNaN(parsedRate)) return null

  if (parsedRate > 0 && parsedRate <= 1) return parsedRate * 100
  return parsedRate
}

function parseVatAmount(vatAmountRaw) {
  if (vatAmountRaw === null || vatAmountRaw === undefined || vatAmountRaw === '') return null
  const cleaned = String(vatAmountRaw).replace(',', '.').trim()
  const parsedAmount = Number(cleaned)
  return Number.isNaN(parsedAmount) ? null : parsedAmount
}

function buildEntriesFromWorkbook(workbook, userId) {
  const allEntries = []

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) return

    const rows = XLSX.utils.sheet_to_json(sheet)
    const center = sheetName

    rows.forEach((row) => {
      const dataRaw = row['Data']
      const tipo = row['Tipo']
      const descrizione = row['Descrizione']
      const lordo = row['Prezzo (lordo)']
      const metodo = row['Metodo di pagamento']
      const idTrans = row['ID Transazione']

      const vatRateRaw =
        row['Percentuale imposta'] ??
        row['Aliquota IVA'] ??
        row['IVA %'] ??
        row['IVA (%)'] ??
        null

      const vatAmountRaw =
        row['IVA'] ??
        row['Imposta'] ??
        row['Importo IVA'] ??
        null

      const parsed = parseItalianDateTimeToStrings(String(dataRaw || ''))
      if (!parsed) return

      if (!descrizione || lordo === null || lordo === undefined || lordo === '') return
      if (tipo && tipo !== 'Vendita') return

      const amountIn = Number(String(lordo).replace(',', '.'))
      if (Number.isNaN(amountIn)) return

      const vatRate = parseVatRate(vatRateRaw)
      const vatAmount = parseVatAmount(vatAmountRaw)

      allEntries.push({
        user_id: userId,
        date: parsed.date,
        operation_datetime: parsed.datetime,
        description: String(descrizione).trim(),
        amount_in: amountIn,
        amount_out: 0,
        account_code: null,
        method: metodo ? String(metodo).trim() : null,
        center,
        note: idTrans ? `SumUp ${String(idTrans).trim()}` : null,
        source: 'sumup',
        nature: null,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        vat_side: vatRate && vatRate > 0 ? 'debito' : null,
        source_transaction_code: idTrans ? String(idTrans).trim() : null,
      })
    })
  })

  return allEntries
}

export default function EntriesPage() {
  const { role, user } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  const [searchDraft, setSearchDraft] = useState('')
  const [fromDateDraft, setFromDateDraft] = useState('')
  const [fromTimeDraft, setFromTimeDraft] = useState('')
  const [toDateDraft, setToDateDraft] = useState('')
  const [toTimeDraft, setToTimeDraft] = useState('')
  const [onlyWithoutAccountDraft, setOnlyWithoutAccountDraft] = useState(false)
  const [onlyWithoutNatureDraft, setOnlyWithoutNatureDraft] = useState(false)
  const [accountCodeDraft, setAccountCodeDraft] = useState('')
  const [ivaFilterDraft, setIvaFilterDraft] = useState('')
  const [applyScope, setApplyScope] = useState('single')

  const [filters, setFilters] = useState({
    search: '',
    fromDate: '',
    fromTime: '',
    toDate: '',
    toTime: '',
    onlyWithoutAccount: false,
    onlyWithoutNature: false,
    accountCode: '',
    ivaFilter: '',
  })

  const [lastImportedFile, setLastImportedFile] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 1000

  const entriesQuery = useQuery({
    queryKey: ['entries', filters, page],
    queryFn: () => fetchEntries({ ...filters, page, pageSize: PAGE_SIZE }),
  })

  const totalsQuery = useQuery({
    queryKey: ['entries-totals', filters],
    queryFn: () => fetchEntriesFilteredTotals(filters),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  })

  const lastImportQuery = useQuery({
    queryKey: ['last-sumup-import'],
    queryFn: fetchLastSumupImport,
  })

  const createMutation = useMutation({
    mutationFn: createEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['entries-totals'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateEntry(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['entries-totals'] })
      closeModal()
    },
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: bulkUpdateEntries,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['entries-totals'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['entries-totals'] })
    },
  })

  const importMutation = useMutation({
    mutationFn: importSumupEntries,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['entries-totals'] })
      queryClient.invalidateQueries({ queryKey: ['last-sumup-import'] })

      alert(
        `Import completato.\nNuove righe: ${result.imported_rows}\nDuplicate saltate: ${result.skipped_rows}`
      )

      setImportPreview([])
      setIsImportModalOpen(false)
      setLastImportedFile('')
    },
    onError: (error) => {
      console.error(error)
      alert(error.message || "Errore durante l'import SumUp")
    },
  })

  const entriesData = entriesQuery.data || {
    rows: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
  }

  const totals = totalsQuery.data || {
    total_rows: 0,
    total_in: 0,
    total_out: 0,
    saldo: 0,
  }

  const entries = entriesData.rows
  const accounts = accountsQuery.data || []

  function applyFilters() {
    setPage(1)
    setFilters({
      search: searchDraft,
      fromDate: fromDateDraft,
      fromTime: fromTimeDraft,
      toDate: toDateDraft,
      toTime: toTimeDraft,
      onlyWithoutAccount: onlyWithoutAccountDraft,
      onlyWithoutNature: onlyWithoutNatureDraft,
      accountCode: onlyWithoutAccountDraft ? '' : accountCodeDraft,
      ivaFilter: ivaFilterDraft,
    })
  }

  function resetFilters() {
    setSearchDraft('')
    setFromDateDraft('')
    setFromTimeDraft('')
    setToDateDraft('')
    setToTimeDraft('')
    setOnlyWithoutAccountDraft(false)
    setOnlyWithoutNatureDraft(false)
    setAccountCodeDraft('')
    setIvaFilterDraft('')
    setPage(1)

    setFilters({
      search: '',
      fromDate: '',
      fromTime: '',
      toDate: '',
      toTime: '',
      onlyWithoutAccount: false,
      onlyWithoutNature: false,
      accountCode: '',
      ivaFilter: '',
    })
  }

  function onChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function clearAmounts() {
    setForm((prev) => ({
      ...prev,
      amount_in: '',
      amount_out: '',
      vat_rate: '',
      vat_amount: '',
    }))
  }

  function openCreateModal() {
    setEditing(null)
    setApplyScope('single')
    setForm(emptyForm)
    setIsModalOpen(true)
  }

  function handleEdit(row) {
    setEditing(row)
    setApplyScope('single')
    setForm({
      date: row.date || today,
      description: row.description || '',
      amount_in: row.amount_in ?? '',
      amount_out: row.amount_out ?? '',
      account_code: row.account_code || '',
      method: row.method || '',
      center: row.center || '',
      nature: row.nature || '',
      vat_mode:
        row.vat_side === 'debito'
          ? 'debit'
          : row.vat_side === 'credito'
            ? 'credit'
            : 'none',
      vat_rate: row.vat_rate ?? '',
      vat_amount: row.vat_amount ?? '',
      note: row.note || '',
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setEditing(null)
    setApplyScope('single')
    setForm(emptyForm)
    setIsModalOpen(false)
  }

  function handleDelete(row) {
    const ok = window.confirm(`Eliminare il movimento \"${row.description || 'senza descrizione'}\"?`)
    if (!ok) return
    deleteMutation.mutate(row.id)
  }

  async function handleFilePick(e) {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const parsedEntries = buildEntriesFromWorkbook(workbook, user.id)

      if (parsedEntries.length === 0) {
        alert('Nessun movimento valido trovato nel file.')
        return
      }

      setLastImportedFile(file.name)
      setImportPreview(parsedEntries)
      setIsImportModalOpen(true)
    } catch (err) {
      console.error(err)
      alert(err.message || "Errore durante l'import da SumUp")
    } finally {
      e.target.value = ''
    }
  }

  function confirmImport() {
    if (!importPreview.length || !user?.id) return

    importMutation.mutate({
      userId: user.id,
      fileName: lastImportedFile || 'sumup.xlsx',
      rows: importPreview,
    })
  }

  function handleSubmit(e) {
    e.preventDefault()

    const payload = {
      user_id: editing?.user_id || user?.id || null,
      date: form.date || null,
      operation_datetime: form.date ? new Date(`${form.date}T00:00:00`).toISOString() : null,
      description: form.description || null,
      amount_in: normalizeNumberInput(form.amount_in),
      amount_out: normalizeNumberInput(form.amount_out),
      account_code: form.account_code || null,
      method: form.method || null,
      center: form.center || null,
      note: form.note || null,
      source: editing?.source || 'Manuale',
      nature: form.nature || null,
      vat_rate: normalizeNumberInput(form.vat_rate),
      vat_amount: normalizeNumberInput(form.vat_amount),
      vat_side:
        form.vat_mode === 'debit'
          ? 'debito'
          : form.vat_mode === 'credit'
            ? 'credito'
            : null,
    }

    if (!editing) {
      createMutation.mutate(payload)
      return
    }

    if (applyScope === 'single') {
      updateMutation.mutate({ id: editing.id, payload })
      return
    }

    if (applyScope === 'page') {
      const pageIds = entries.map((row) => row.id)
      bulkUpdateMutation.mutate({ ids: pageIds, filters, updates: payload })
      return
    }

    bulkUpdateMutation.mutate({ ids: null, filters, updates: payload })
  }

  return (
    <section className="page">
      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Filtri e import</h2>
            <p>Ricerca movimenti, filtri avanzati e import file SumUp.</p>
          </div>

          {isAdmin ? (
            <button type="button" className="topbar__button topbar__button--primary" onClick={openCreateModal}>
              Nuovo movimento
            </button>
          ) : null}
        </div>

        <div className="entries-filters-grid entries-filters-grid--light">
          <div className="entries-field entries-field--full">
            <label>Ricerca</label>
            <input
              type="text"
              placeholder="Cerca per descrizione..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>

          <div className="entries-field">
            <label>Da data</label>
            <input type="date" value={fromDateDraft} onChange={(e) => setFromDateDraft(e.target.value)} />
          </div>

          <div className="entries-field">
            <label>Ora</label>
            <input type="time" value={fromTimeDraft} onChange={(e) => setFromTimeDraft(e.target.value)} />
          </div>

          <div className="entries-field">
            <label>A data</label>
            <input type="date" value={toDateDraft} onChange={(e) => setToDateDraft(e.target.value)} />
          </div>

          <div className="entries-field">
            <label>Ora</label>
            <input type="time" value={toTimeDraft} onChange={(e) => setToTimeDraft(e.target.value)} />
          </div>

          <div className="entries-field entries-toggle">
            <label>Filtro</label>
            <div className="entries-toggle__row entries-toggle__row--light">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={onlyWithoutAccountDraft}
                  onChange={(e) => setOnlyWithoutAccountDraft(e.target.checked)}
                />
                <span className="slider" />
              </label>
              <span>Senza conto</span>
            </div>
          </div>

          <div className="entries-field entries-toggle">
            <label>Filtro</label>
            <div className="entries-toggle__row entries-toggle__row--light">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={onlyWithoutNatureDraft}
                  onChange={(e) => setOnlyWithoutNatureDraft(e.target.checked)}
                />
                <span className="slider" />
              </label>
              <span>Senza natura</span>
            </div>
          </div>

          <div className="entries-field">
            <label>Conto</label>
            <select
              value={accountCodeDraft}
              onChange={(e) => setAccountCodeDraft(e.target.value)}
              disabled={onlyWithoutAccountDraft}
            >
              <option value="">Tutti</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.code}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="entries-field">
            <label>IVA</label>
            <select value={ivaFilterDraft} onChange={(e) => setIvaFilterDraft(e.target.value)}>
              <option value="">Tutte</option>
              <option value="with_vat">Solo con IVA</option>
              <option value="without_vat">Solo senza IVA</option>
            </select>
          </div>

          <div className="entries-actions">
            <button type="button" className="topbar__button topbar__button--primary" onClick={applyFilters}>
              Cerca
            </button>
            <button type="button" className="topbar__button" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </div>

        <div className="entries-import-meta entries-import-meta--light">
          <strong>Ultimo import Excel:</strong>{' '}
          {lastImportQuery.data
            ? `${lastImportQuery.data.file_name || 'file senza nome'} · ${new Date(
              lastImportQuery.data.created_at
            ).toLocaleString('it-IT')} · importate ${lastImportQuery.data.imported_rows} · duplicate saltate ${lastImportQuery.data.skipped_rows}`
            : '—'}
        </div>

        <div className="entries-import-box entries-import-box--light">
          <label>Importa da SumUp (.xlsx):</label>
          <div className="entries-import-box__row entries-import-box__row--light">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFilePick}
            />
          </div>
        </div>
      </div>

      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Movimenti</h2>
            <p>
              Elenco risultati filtrati. Totale: <strong>{entriesData.total}</strong>
            </p>
          </div>

          <div className="entries-pagination-top">
            <button
              type="button"
              className="topbar__button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ←
            </button>

            <div className="entries-page-indicator">
              Pagina {entriesData.page} di {entriesData.totalPages}
            </div>

            <button
              type="button"
              className="topbar__button"
              onClick={() => setPage((p) => Math.min(entriesData.totalPages, p + 1))}
              disabled={page >= entriesData.totalPages}
            >
              →
            </button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card stat-card--accent">
            <div className="stat-card__title">Entrate filtrate</div>
            <div className="stat-card__value">{euro(totals.total_in)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__title">Uscite filtrate</div>
            <div className="stat-card__value">{euro(totals.total_out)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__title">Saldo filtrato</div>
            <div className="stat-card__value">{euro(totals.saldo)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__title">Movimenti</div>
            <div className="stat-card__value">{totals.total_rows}</div>
          </div>
        </div>

        {entriesQuery.isLoading || accountsQuery.isLoading ? <p>Caricamento movimenti...</p> : null}
        {entriesQuery.error ? <p>Errore: {entriesQuery.error.message}</p> : null}

        {!entriesQuery.isLoading && !entriesQuery.error ? (
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th>Entrata</th>
                  <th>Uscita</th>
                  <th>Conto</th>
                  <th>Metodo</th>
                  <th>Centro</th>
                  <th>Natura</th>
                  <th>IVA</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="10">Nessun movimento trovato.</td>
                  </tr>
                ) : (
                  entries.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.operation_datetime
                          ? new Date(row.operation_datetime).toLocaleDateString('it-IT')
                          : row.date || '-'}
                      </td>
                      <td>{row.description || '-'}</td>
                      <td>{Number(row.amount_in || 0) > 0 ? euro(row.amount_in) : '-'}</td>
                      <td>{Number(row.amount_out || 0) > 0 ? euro(row.amount_out) : '-'}</td>
                      <td>{row.account_code || '-'}</td>
                      <td>{row.method || '-'}</td>
                      <td>{row.center || '-'}</td>
                      <td>{row.nature || '-'}</td>
                      <td>
                        {row.vat_rate ? `${row.vat_rate}%` : '—'}
                        {row.vat_side ? ` · ${row.vat_side}` : ''}
                      </td>
                      <td>
                        {isAdmin ? (
                          <div className="rowActions">
                            <button type="button" className="actionBtn" onClick={() => handleEdit(row)}>
                              Modifica
                            </button>
                            <button
                              type="button"
                              className="actionBtn actionBtn--danger"
                              onClick={() => handleDelete(row)}
                            >
                              Elimina
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="entries-pagination-bottom">
        <button
          type="button"
          className="topbar__button"
          onClick={() => setPage(1)}
          disabled={page === 1}
        >
          Prima
        </button>

        <button
          type="button"
          className="topbar__button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Precedente
        </button>

        <div className="entries-page-indicator">
          Pagina {entriesData.page} di {entriesData.totalPages}
        </div>

        <button
          type="button"
          className="topbar__button"
          onClick={() => setPage((p) => Math.min(entriesData.totalPages, p + 1))}
          disabled={page === entriesData.totalPages}
        >
          Successiva
        </button>

        <button
          type="button"
          className="topbar__button"
          onClick={() => setPage(entriesData.totalPages)}
          disabled={page === entriesData.totalPages}
        >
          Ultima
        </button>
      </div>

      {isModalOpen ? (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>{editing ? 'Modifica movimento' : 'Nuovo movimento'}</h3>
                <p>Inserisci il movimento in modo semplice e ordinato.</p>
              </div>
            </div>

            <form className="entry-modal-form" onSubmit={handleSubmit}>
              <div className="entry-modal-section">
                <div className="entry-modal-section__header">
                  <h4>Dati principali</h4>
                  <p>Inserisci le informazioni base del movimento.</p>
                </div>

                <div className="entry-modal-grid entry-modal-grid--2">
                  <div className="entry-modal-field">
                    <label>Data movimento</label>
                    <input name="date" type="date" value={form.date} onChange={onChange} required />
                  </div>

                  <div className="entry-modal-field entry-modal-field--full">
                    <label>Descrizione</label>
                    <input
                      name="description"
                      placeholder="Es. Incasso serata, bonifico insegnante, acquisto bevande..."
                      value={form.description}
                      onChange={onChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="entry-modal-section">
                <div className="entry-modal-section__header">
                  <h4>Importi e conto</h4>
                  <p>Compila entrata o uscita e collega il conto corretto.</p>
                </div>

                <div className="entry-modal-grid entry-modal-grid--3">
                  <div className="entry-modal-field">
                    <label>Entrata</label>
                    <input
                      name="amount_in"
                      placeholder="0,00"
                      value={form.amount_in}
                      onChange={onChange}
                    />
                  </div>

                  <div className="entry-modal-field">
                    <label>Uscita</label>
                    <input
                      name="amount_out"
                      placeholder="0,00"
                      value={form.amount_out}
                      onChange={onChange}
                    />
                  </div>

                  <div className="entry-modal-field entry-modal-field--full">
                    <label>Conto</label>
                    <select name="account_code" value={form.account_code} onChange={onChange}>
                      <option value="">— Seleziona conto —</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.code}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="entry-modal-section">
                <div className="entry-modal-section__header">
                  <h4>Classificazione</h4>
                  <p>Assegna metodo, centro e natura del movimento.</p>
                </div>

                <div className="entry-modal-grid entry-modal-grid--3">
                  <div className="entry-modal-field">
                    <label>Metodo</label>
                    <select name="method" value={form.method} onChange={onChange}>
                      <option value="">Seleziona metodo</option>
                      {METHOD_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-modal-field">
                    <label>Centro</label>
                    <select name="center" value={form.center} onChange={onChange}>
                      <option value="">Seleziona centro</option>
                      {CENTER_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-modal-field">
                    <label>Natura</label>
                    <select name="nature" value={form.nature} onChange={onChange}>
                      <option value="">Seleziona natura</option>
                      {NATURE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="entry-modal-section">
                <div className="entry-modal-section__header">
                  <h4>IVA</h4>
                  <p>Scegli il trattamento IVA e inserisci i valori se necessari.</p>
                </div>

                <div className="entry-vat-cards">
                  <label className={form.vat_mode === 'none' ? 'entry-vat-card entry-vat-card--active' : 'entry-vat-card'}>
                    <input
                      type="radio"
                      name="vat_mode"
                      value="none"
                      checked={form.vat_mode === 'none'}
                      onChange={onChange}
                    />
                    <div>
                      <strong>Nessuna</strong>
                      <span>Il movimento non ha gestione IVA</span>
                    </div>
                  </label>

                  <label className={form.vat_mode === 'debit' ? 'entry-vat-card entry-vat-card--active' : 'entry-vat-card'}>
                    <input
                      type="radio"
                      name="vat_mode"
                      value="debit"
                      checked={form.vat_mode === 'debit'}
                      onChange={onChange}
                    />
                    <div>
                      <strong>A debito</strong>
                      <span>Vendite / IVA da versare</span>
                    </div>
                  </label>

                  <label className={form.vat_mode === 'credit' ? 'entry-vat-card entry-vat-card--active' : 'entry-vat-card'}>
                    <input
                      type="radio"
                      name="vat_mode"
                      value="credit"
                      checked={form.vat_mode === 'credit'}
                      onChange={onChange}
                    />
                    <div>
                      <strong>A credito</strong>
                      <span>Acquisti / IVA detraibile</span>
                    </div>
                  </label>
                </div>

                <div className="entry-modal-grid entry-modal-grid--2">
                  <div className="entry-modal-field">
                    <label>Aliquota IVA %</label>
                    <select name="vat_rate" value={form.vat_rate} onChange={onChange}>
                      <option value="">Seleziona aliquota</option>
                      {VAT_RATE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="entry-modal-field">
                    <label>Importo IVA</label>
                    <input
                      name="vat_amount"
                      placeholder="0,00"
                      value={form.vat_amount}
                      onChange={onChange}
                    />
                  </div>
                </div>
              </div>

              <div className="entry-modal-section">
                <div className="entry-modal-section__header">
                  <h4>Note</h4>
                  <p>Campo facoltativo per dettagli aggiuntivi.</p>
                </div>

                <div className="entry-modal-grid entry-modal-grid--1">
                  <div className="entry-modal-field entry-modal-field--full">
                    <input
                      name="note"
                      placeholder="Inserisci eventuali note..."
                      value={form.note}
                      onChange={onChange}
                    />
                  </div>
                </div>
              </div>

              {editing ? (
                <div className="entry-modal-section">
                  <div className="entry-modal-section__header">
                    <h4>Applica modifiche</h4>
                    <p>Scegli quante voci aggiornare con le modifiche che stai salvando.</p>
                  </div>

                  <div className="entry-modal-grid entry-modal-grid--1">
                    <div className="entry-modal-field">
                      <label>Ambito modifica</label>
                      <select
                        name="apply_scope"
                        value={applyScope}
                        onChange={(e) => setApplyScope(e.target.value)}
                      >
                        <option value="single">Solo questa voce</option>
                        <option value="page">Tutte le voci della pagina corrente</option>
                        <option value="search">Tutti i risultati della ricerca</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="entry-modal-actions">
                <div className="entry-modal-actions__left">
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={clearAmounts}
                  >
                    Svuota importi
                  </button>
                </div>

                <div className="entry-modal-actions__right">
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={closeModal}
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    className="topbar__button topbar__button--primary"
                    disabled={
                      !isAdmin ||
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      bulkUpdateMutation.isPending
                    }
                  >
                    {editing ? 'Salva modifiche' : 'Salva movimento'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isImportModalOpen ? (
        <div className="modalOverlay" onClick={() => setIsImportModalOpen(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Anteprima import SumUp</h3>
                <p>{importPreview.length} movimenti letti dal file. I duplicati verranno saltati in fase di import.</p>
              </div>
            </div>

            <div className="tableWrap">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th>Entrata</th>
                    <th>Metodo</th>
                    <th>Centro</th>
                    <th>Nota</th>
                    <th>IVA %</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 50).map((row, idx) => (
                    <tr key={`${row.description}-${idx}`}>
                      <td>{row.date}</td>
                      <td>{row.description}</td>
                      <td>{euro(row.amount_in)}</td>
                      <td>{row.method || '-'}</td>
                      <td>{row.center || '-'}</td>
                      <td>{row.note || '-'}</td>
                      <td>{row.vat_rate ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importPreview.length > 50 ? (
              <p style={{ marginTop: 12 }}>
                Anteprima limitata alle prime 50 righe su {importPreview.length}.
              </p>
            ) : null}

            <div className="entry-modal-actions" style={{ marginTop: 16 }}>
              <div className="entry-modal-actions__left">
                <button
                  type="button"
                  className="topbar__button"
                  onClick={() => {
                    setImportPreview([])
                    setIsImportModalOpen(false)
                  }}
                >
                  Annulla
                </button>
              </div>

              <div className="entry-modal-actions__right">
                <button
                  type="button"
                  className="topbar__button topbar__button--primary"
                  onClick={confirmImport}
                  disabled={!isAdmin || importMutation.isPending}
                >
                  {importMutation.isPending ? 'Import in corso...' : 'Conferma import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}