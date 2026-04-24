import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Banknote,
  Building2,
  CalendarDays,
  CirclePlus,
  Pencil,
  Receipt,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import '../styles/PagamentiPage.css'
import {
  buildScheduleRows,
  createPaymentScheduleRule,
  deletePaymentScheduleRule,
  euro,
  fetchPaymentScheduleRules,
  fetchPaymentScheduleSkips,
  fetchRegisteredPayments,
  fetchRegisteredPaymentsSummary,
  mapEntryToPaymentCategory,
  skipPaymentScheduleMonth,
  unskipPaymentScheduleMonth,
  updatePaymentScheduleRule,
} from '../api/payments'

const CATEGORY_OPTIONS = [
  'Affitto',
  'Pulizie',
  'SIAE',
  'Utenze',
  'Fornitori',
  'Varie',
  'Altro',
]

const METHOD_OPTIONS = ['Bonifico', 'Contanti', 'Carta', 'RID', 'Altro']

const currentMonth = dayjs().format('YYYY-MM')

const emptyRuleForm = {
  title: '',
  category: 'Affitto',
  supplier: '',
  description: '',
  default_amount: '',
  due_day: 1,
  payment_method: 'Bonifico',
  is_active: true,
}

export default function PagamentiPage() {
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('registrati')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [month, setMonth] = useState(currentMonth)

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [ruleForm, setRuleForm] = useState(emptyRuleForm)

  const registeredPaymentsQuery = useQuery({
    queryKey: ['registered-payments', { search, category, month }],
    queryFn: () => fetchRegisteredPayments({ search, category, month }),
  })

  const registeredSummaryQuery = useQuery({
    queryKey: ['registered-payments-summary', { month }],
    queryFn: () => fetchRegisteredPaymentsSummary({ month }),
  })

  const scheduleRulesQuery = useQuery({
    queryKey: ['payment-schedule-rules'],
    queryFn: fetchPaymentScheduleRules,
  })

  const scheduleSkipsQuery = useQuery({
    queryKey: ['payment-schedule-skips', month],
    queryFn: () => fetchPaymentScheduleSkips(month),
  })

  const createRuleMutation = useMutation({
    mutationFn: createPaymentScheduleRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-rules'] })
      closeRuleModal()
    },
  })

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, payload }) => updatePaymentScheduleRule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-rules'] })
      closeRuleModal()
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: deletePaymentScheduleRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-rules'] })
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-skips'] })
    },
  })

  const skipMonthMutation = useMutation({
    mutationFn: skipPaymentScheduleMonth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-skips'] })
    },
  })

  const unskipMonthMutation = useMutation({
    mutationFn: unskipPaymentScheduleMonth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedule-skips'] })
    },
  })

  const payments = registeredPaymentsQuery.data?.rows || []
  const summary = registeredSummaryQuery.data || { total: 0, count: 0 }
  const scheduleRules = scheduleRulesQuery.data || []
  const scheduleSkips = scheduleSkipsQuery.data || []

  const scheduleRows = useMemo(() => {
    return buildScheduleRows(scheduleRules, scheduleSkips, month)
  }, [scheduleRules, scheduleSkips, month])

  const summaryByCategory = useMemo(() => {
    return payments.reduce((acc, item) => {
      const cat = mapEntryToPaymentCategory(item)
      acc[cat] = (acc[cat] || 0) + Number(item.amount_out || 0)
      return acc
    }, {})
  }, [payments])

  const topCategories = useMemo(() => {
    return Object.entries(summaryByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }, [summaryByCategory])

  function openCreateRuleModal() {
    setEditingRule(null)
    setRuleForm(emptyRuleForm)
    setIsRuleModalOpen(true)
  }

  function openEditRuleModal(rule) {
    setEditingRule(rule)
    setRuleForm({
      title: rule.title || '',
      category: rule.category || 'Affitto',
      supplier: rule.supplier || '',
      description: rule.description || '',
      default_amount: rule.default_amount ?? '',
      due_day: rule.due_day || 1,
      payment_method: rule.payment_method || 'Bonifico',
      is_active: !!rule.is_active,
    })
    setIsRuleModalOpen(true)
  }

  function closeRuleModal() {
    setIsRuleModalOpen(false)
    setEditingRule(null)
    setRuleForm(emptyRuleForm)
  }

  function handleRuleChange(e) {
    const { name, value, type, checked } = e.target
    setRuleForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleRuleSubmit(e) {
    e.preventDefault()

    const payload = {
      title: ruleForm.title.trim(),
      category: ruleForm.category,
      supplier: ruleForm.supplier.trim() || null,
      description: ruleForm.description.trim() || null,
      default_amount: ruleForm.default_amount !== ''
        ? Number(ruleForm.default_amount)
        : null,
      due_day: Number(ruleForm.due_day || 1),
      payment_method: ruleForm.payment_method || null,
      is_active: !!ruleForm.is_active,
    }

    if (!payload.title) {
      alert('Inserisci un titolo per la scadenza.')
      return
    }

    if (!payload.due_day || payload.due_day < 1 || payload.due_day > 28) {
      alert('Il giorno di scadenza deve essere compreso tra 1 e 28.')
      return
    }

    if (
      payload.default_amount !== null &&
      (Number.isNaN(payload.default_amount) || payload.default_amount < 0)
    ) {
      alert('Inserisci un importo valido.')
      return
    }

    if (editingRule) {
      updateRuleMutation.mutate({
        id: editingRule.id,
        payload,
      })
    } else {
      createRuleMutation.mutate(payload)
    }
  }

  function handleDeleteRule(rule) {
    const ok = window.confirm(
      `Vuoi eliminare la regola "${rule.title}"?`
    )
    if (!ok) return
    deleteRuleMutation.mutate(rule.id)
  }

  function handleToggleMonthlySkip(rule) {
    if (!rule.is_active) return

    if (rule.is_skipped) {
      unskipMonthMutation.mutate({
        ruleId: rule.id,
        month,
      })
      return
    }

    const reason = window.prompt(
      `Motivo annullamento per ${dayjs(`${month}-01`).format('MMMM YYYY')}:`,
      'Mensilità annullata'
    )

    if (reason === null) return

    skipMonthMutation.mutate({
      ruleId: rule.id,
      month,
      reason: reason.trim(),
    })
  }

  return (
    <div className="payments-page">
      <div className="payments-header">
        <div>
          <h1>Pagamenti</h1>
          <p>
            Visualizza i pagamenti registrati in prima nota e gestisci lo
            scadenziario mensile di affitto, pulizie e altre spese ricorrenti.
          </p>
        </div>

        {activeTab === 'scadenziario' && (
          <button className="payments-primary-btn" onClick={openCreateRuleModal}>
            <CirclePlus size={18} />
            Nuova scadenza
          </button>
        )}
      </div>

      <div className="payments-tabs">
        <button
          className={`payments-tab ${activeTab === 'registrati' ? 'active' : ''}`}
          onClick={() => setActiveTab('registrati')}
        >
          Pagamenti registrati
        </button>
        <button
          className={`payments-tab ${activeTab === 'scadenziario' ? 'active' : ''}`}
          onClick={() => setActiveTab('scadenziario')}
        >
          Scadenziario
        </button>
      </div>

      {activeTab === 'registrati' && (
        <>
          <div className="payments-summary-grid">
            <div className="payments-summary-card">
              <div className="payments-summary-icon">
                <Wallet size={20} />
              </div>
              <div>
                <span className="payments-summary-label">Totale mese</span>
                <strong>{euro(summary.total)}</strong>
              </div>
            </div>

            <div className="payments-summary-card">
              <div className="payments-summary-icon">
                <Receipt size={20} />
              </div>
              <div>
                <span className="payments-summary-label">Pagamenti registrati</span>
                <strong>{summary.count}</strong>
              </div>
            </div>

            <div className="payments-summary-card">
              <div className="payments-summary-icon">
                <Building2 size={20} />
              </div>
              <div>
                <span className="payments-summary-label">Categoria principale</span>
                <strong>{topCategories[0]?.[0] || '—'}</strong>
              </div>
            </div>

            <div className="payments-summary-card">
              <div className="payments-summary-icon">
                <Banknote size={20} />
              </div>
              <div>
                <span className="payments-summary-label">Top importo categoria</span>
                <strong>{topCategories[0] ? euro(topCategories[0][1]) : '—'}</strong>
              </div>
            </div>
          </div>

          <div className="payments-filters-card">
            <div className="payments-filter-field payments-search-field">
              <Search size={16} />
              <input
                type="text"
                placeholder="Cerca nei movimenti di prima nota..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="payments-filter-field">
              <label>Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">Tutte</option>
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="payments-filter-field">
              <label>Mese</label>
              <div className="payments-month-wrap">
                <CalendarDays size={16} />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="payments-table-card">
            {registeredPaymentsQuery.isLoading ? (
              <div className="payments-empty-state">Caricamento pagamenti...</div>
            ) : payments.length === 0 ? (
              <div className="payments-empty-state">
                Nessun pagamento trovato per i filtri selezionati.
              </div>
            ) : (
              <div className="payments-table-wrap">
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Categoria</th>
                      <th>Descrizione</th>
                      <th>Note</th>
                      <th>Metodo</th>
                      <th>Origine</th>
                      <th>Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((item) => {
                      const categoryLabel = mapEntryToPaymentCategory(item)

                      return (
                        <tr key={item.id}>
                          <td>{item.date || '—'}</td>
                          <td>
                            <span
                              className={`payments-badge payments-badge-${slugify(categoryLabel)}`}
                            >
                              {categoryLabel}
                            </span>
                          </td>
                          <td>
                            <div className="payments-description-cell">
                              <strong>{item.description || '—'}</strong>
                            </div>
                          </td>
                          <td>{item.note || '—'}</td>
                          <td>{item.method || '—'}</td>
                          <td>{item.source || '—'}</td>
                          <td className="payments-amount">
                            {euro(item.amount_out)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'scadenziario' && (
        <>
          <div className="payments-filters-card payments-filters-card-schedule">
            <div className="payments-filter-field">
              <label>Mese di riferimento</label>
              <div className="payments-month-wrap">
                <CalendarDays size={16} />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="payments-table-card">
            {scheduleRulesQuery.isLoading || scheduleSkipsQuery.isLoading ? (
              <div className="payments-empty-state">Caricamento scadenziario...</div>
            ) : scheduleRows.length === 0 ? (
              <div className="payments-empty-state">
                Nessuna regola di scadenza configurata.
              </div>
            ) : (
              <div className="payments-table-wrap">
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>Titolo</th>
                      <th>Categoria</th>
                      <th>Fornitore</th>
                      <th>Scadenza</th>
                      <th>Importo previsto</th>
                      <th>Metodo</th>
                      <th>Stato</th>
                      <th className="payments-actions-col">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="payments-description-cell">
                            <strong>{item.title}</strong>
                            {item.description ? <span>{item.description}</span> : null}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`payments-badge payments-badge-${slugify(item.category)}`}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td>{item.supplier || '—'}</td>
                        <td>{item.due_date}</td>
                        <td>
                          {item.default_amount !== null && item.default_amount !== undefined
                            ? euro(item.default_amount)
                            : '—'}
                        </td>
                        <td>{item.payment_method || '—'}</td>
                        <td>
                          {!item.is_active ? (
                            <span className="payments-badge payments-badge-altro">
                              Disattivato
                            </span>
                          ) : item.is_skipped ? (
                            <span className="payments-badge payments-badge-varie">
                              Annullato per questo mese
                            </span>
                          ) : (
                            <span className="payments-badge payments-badge-pulizie">
                              Attivo
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="payments-actions">
                            <button
                              className="payments-icon-btn"
                              onClick={() => openEditRuleModal(item)}
                              title="Modifica regola"
                            >
                              <Pencil size={16} />
                            </button>

                            {item.is_active && (
                              <button
                                className="payments-icon-btn"
                                onClick={() => handleToggleMonthlySkip(item)}
                                title={
                                  item.is_skipped
                                    ? 'Ripristina questo mese'
                                    : 'Annulla questo mese'
                                }
                              >
                                {item.is_skipped ? (
                                  <CalendarDays size={16} />
                                ) : (
                                  <X size={16} />
                                )}
                              </button>
                            )}

                            <button
                              className="payments-icon-btn danger"
                              onClick={() => handleDeleteRule(item)}
                              title="Elimina regola"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {isRuleModalOpen && (
        <div className="payments-modal-overlay" onClick={closeRuleModal}>
          <div className="payments-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payments-modal-header">
              <div>
                <h2>{editingRule ? 'Modifica scadenza' : 'Nuova scadenza'}</h2>
                <p>
                  Configura una regola ricorrente mensile da mostrare nello
                  scadenziario.
                </p>
              </div>
              <button className="payments-close-btn" onClick={closeRuleModal}>
                <X size={18} />
              </button>
            </div>

            <form className="payments-form" onSubmit={handleRuleSubmit}>
              <div className="payments-form-grid">
                <div className="payments-form-field">
                  <label>Titolo</label>
                  <input
                    name="title"
                    type="text"
                    value={ruleForm.title}
                    onChange={handleRuleChange}
                    placeholder="Es. Affitto sede"
                  />
                </div>

                <div className="payments-form-field">
                  <label>Categoria</label>
                  <select
                    name="category"
                    value={ruleForm.category}
                    onChange={handleRuleChange}
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="payments-form-field">
                  <label>Fornitore</label>
                  <input
                    name="supplier"
                    type="text"
                    value={ruleForm.supplier}
                    onChange={handleRuleChange}
                    placeholder="Es. Proprietario immobile / Impresa XYZ"
                  />
                </div>

                <div className="payments-form-field">
                  <label>Metodo pagamento</label>
                  <select
                    name="payment_method"
                    value={ruleForm.payment_method}
                    onChange={handleRuleChange}
                  >
                    {METHOD_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="payments-form-field payments-form-field-full">
                  <label>Descrizione</label>
                  <input
                    name="description"
                    type="text"
                    value={ruleForm.description}
                    onChange={handleRuleChange}
                    placeholder="Es. Affitto mensile sede sociale"
                  />
                </div>

                <div className="payments-form-field">
                  <label>Importo previsto</label>
                  <input
                    name="default_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={ruleForm.default_amount}
                    onChange={handleRuleChange}
                    placeholder="0,00"
                  />
                </div>

                <div className="payments-form-field">
                  <label>Giorno scadenza</label>
                  <input
                    name="due_day"
                    type="number"
                    min="1"
                    max="28"
                    value={ruleForm.due_day}
                    onChange={handleRuleChange}
                  />
                </div>

                <div className="payments-form-field payments-form-field-full payments-checkbox-field">
                  <label className="payments-checkbox-label">
                    <input
                      name="is_active"
                      type="checkbox"
                      checked={ruleForm.is_active}
                      onChange={handleRuleChange}
                    />
                    Regola attiva
                  </label>
                </div>
              </div>

              <div className="payments-form-actions">
                <button
                  type="button"
                  className="payments-secondary-btn"
                  onClick={closeRuleModal}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="payments-primary-btn"
                  disabled={
                    createRuleMutation.isPending || updateRuleMutation.isPending
                  }
                >
                  {editingRule ? 'Salva modifiche' : 'Salva scadenza'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function slugify(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
}