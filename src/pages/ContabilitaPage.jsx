import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
    ArrowRight,
    Banknote,
    Building2,
    CalendarRange,
    CheckCircle2,
    CircleAlert,
    Download,
    FileSpreadsheet,
    Landmark,
    LockKeyhole,
    PiggyBank,
    Receipt,
    RefreshCw,
    RotateCcw,
    Scale,
    Settings2,
    UnlockKeyhole,
    Wallet,
    X,
} from 'lucide-react'
import '../styles/ContabilitaPage.css'
import {
    euro,
    fetchContabilitaOverview,
    fetchFinancialPosition,
    fetchRecentAccountingEntries,
    fetchRendicontoGestionale,
} from '../api/contabilita'
import {
    closeFinancialYear,
    fetchFinancialYears,
    normalizeFinancialYearRecord,
    reopenFinancialYear,
    saveFinancialYearPosition,
} from '../api/financialYears'
import {
    buildFinancialYearOptions,
    getCurrentFinancialYear,
    getFinancialPeriod,
    getFinancialYearRange,
} from '../lib/financialYear'
import {
    exportIvaExcel,
    exportIvaPdf,
    exportRendicontoExcel,
    exportRendicontoPdf,
} from '../utils/contabilitaExport'

const currentFinancialYear = getCurrentFinancialYear()
const initialPeriod = getFinancialPeriod(String(currentFinancialYear))

function StatCard({ title, value, icon, variant = 'default', subtitle }) {
    return (
        <div className={`contabilita-stat contabilita-stat--${variant}`}>
            <div className="contabilita-stat__icon">
                {createElement(icon, { size: 20 })}
            </div>
            <div className="contabilita-stat__content">
                <div className="contabilita-stat__title">{title}</div>
                <div className="contabilita-stat__value">{value}</div>
                {subtitle ? <div className="contabilita-stat__subtitle">{subtitle}</div> : null}
            </div>
        </div>
    )
}

function QuickAction({ to, title, description, icon }) {
    return (
        <Link to={to} className="contabilita-action">
            <div className="contabilita-action__icon">
                {createElement(icon, { size: 18 })}
            </div>
            <div className="contabilita-action__body">
                <div className="contabilita-action__title">{title}</div>
                <div className="contabilita-action__description">{description}</div>
            </div>
            <ArrowRight size={18} className="contabilita-action__arrow" />
        </Link>
    )
}

function EmptyState({ title, description }) {
    return (
        <div className="contabilita-empty">
            <div className="contabilita-empty__title">{title}</div>
            <div className="contabilita-empty__description">{description}</div>
        </div>
    )
}

function FilterBar({
    periodSelection,
    financialYears,
    onPeriodSelectionChange,
    fromDate,
    toDate,
    periodicity,
    onFromDateChange,
    onToDateChange,
    onPeriodicityChange,
    onApply,
}) {
    return (
        <div className="contabilita-filterbar">
            <div className="contabilita-filterbar__field contabilita-filterbar__field--year">
                <label>Anno finanziario</label>
                <select value={periodSelection} onChange={(e) => onPeriodSelectionChange(e.target.value)}>
                    {buildFinancialYearOptions(financialYears).map((year) => {
                        const record = financialYears.find((item) => Number(item.year) === year)
                        return (
                            <option key={year} value={year}>
                                {year}{record?.status === 'closed' ? ' — chiuso' : ''}
                            </option>
                        )
                    })}
                    <option value="all">Tutti gli anni</option>
                    <option value="custom">Intervallo personalizzato</option>
                </select>
            </div>

            <div className="contabilita-filterbar__field">
                <label>Dal</label>
                <input
                    type="date"
                    value={fromDate}
                    disabled={periodSelection !== 'custom'}
                    onChange={(e) => onFromDateChange(e.target.value)}
                />
            </div>

            <div className="contabilita-filterbar__field">
                <label>Al</label>
                <input
                    type="date"
                    value={toDate}
                    disabled={periodSelection !== 'custom'}
                    onChange={(e) => onToDateChange(e.target.value)}
                />
            </div>

            <div className="contabilita-filterbar__field">
                <label>Periodicità IVA</label>
                <select value={periodicity} onChange={(e) => onPeriodicityChange(e.target.value)}>
                    <option value="quarterly">Trimestrale</option>
                    <option value="monthly">Mensile</option>
                </select>
            </div>

            <button type="button" className="contabilita-apply-btn" onClick={onApply}>
                <RefreshCw size={16} />
                Applica
            </button>
        </div>
    )
}

export default function ContabilitaPage() {
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [overview, setOverview] = useState(null)
    const [recentEntries, setRecentEntries] = useState([])
    const [rendiconto, setRendiconto] = useState(null)
    const [ivaSummary, setIvaSummary] = useState(null)
    const [ivaScadenziario, setIvaScadenziario] = useState(null)
    const [error, setError] = useState('')
    const [filteredTotals, setFilteredTotals] = useState(null)
    const [financialYears, setFinancialYears] = useState([])
    const [financialPosition, setFinancialPosition] = useState(null)
    const [periodSelection, setPeriodSelection] = useState(String(currentFinancialYear))
    const [appliedFilters, setAppliedFilters] = useState({
        periodSelection: String(currentFinancialYear),
        fromDate: initialPeriod.fromDate,
        toDate: initialPeriod.toDate,
        periodicity: 'quarterly',
    })
    const [positionModalOpen, setPositionModalOpen] = useState(false)
    const [closingModalOpen, setClosingModalOpen] = useState(false)
    const [financialActionPending, setFinancialActionPending] = useState(false)
    const [financialActionError, setFinancialActionError] = useState('')
    const [closeConfirmed, setCloseConfirmed] = useState(false)
    const [positionForm, setPositionForm] = useState({
        openingCashBalance: '0',
        openingBankBalance: '0',
        openingReceivables: '0',
        openingPayables: '0',
        currentReceivables: '0',
        currentPayables: '0',
    })
    const [closingForm, setClosingForm] = useState({
        closingCashBalance: '0',
        closingBankBalance: '0',
        closingReceivables: '0',
        closingPayables: '0',
        note: '',
    })
    const loadSequenceRef = useRef(0)

    const [fromDate, setFromDate] = useState(initialPeriod.fromDate)
    const [toDate, setToDate] = useState(initialPeriod.toDate)
    const [periodicity, setPeriodicity] = useState('quarterly')

    const loadData = async ({ silent = false } = {}) => {
        const sequence = ++loadSequenceRef.current
        const requestedFilters = { periodSelection, fromDate, toDate, periodicity }

        try {
            setError('')
            if (silent) setRefreshing(true)
            else setLoading(true)

            const [rendicontoData, financialYearsData] = await Promise.all([
                fetchRendicontoGestionale({ fromDate, toDate, periodicity }),
                fetchFinancialYears(),
            ])

            const currentYearRange = getFinancialYearRange(currentFinancialYear, { limitToToday: true })
            const currentYearRecord = financialYearsData.find(
                (item) => Number(item.year) === currentFinancialYear
            ) || normalizeFinancialYearRecord(null, currentFinancialYear)
            const canReuseSelectedRows =
                fromDate === currentYearRange.fromDate &&
                toDate === currentYearRange.toDate

            const [overviewData, entriesData, positionData] = await Promise.all([
                fetchContabilitaOverview({ rows: rendicontoData.rows, fromDate, toDate }),
                fetchRecentAccountingEntries(8, { rows: rendicontoData.rows, fromDate, toDate }),
                fetchFinancialPosition({
                    fromDate: currentYearRange.fromDate,
                    toDate: currentYearRange.toDate,
                    openingCashBalance: currentYearRecord.openingCashBalance,
                    openingBankBalance: currentYearRecord.openingBankBalance,
                    receivables: currentYearRecord.currentReceivables,
                    payables: currentYearRecord.currentPayables,
                    rows: canReuseSelectedRows ? rendicontoData.rows : undefined,
                }),
            ])

            // Ignora una risposta vecchia se nel frattempo l'utente ha applicato
            // un altro periodo o ha lasciato la pagina.
            if (sequence !== loadSequenceRef.current) return

            setOverview(overviewData)
            setRecentEntries(entriesData)
            setFinancialYears(financialYearsData)
            setFinancialPosition(positionData)
            setRendiconto(rendicontoData)
            setIvaSummary(rendicontoData?.ivaSummary || null)
            setIvaScadenziario(rendicontoData?.ivaScadenziario || null)
            setAppliedFilters(requestedFilters)
            setFilteredTotals({
                total_in: rendicontoData?.summary?.totale?.totalIn || 0,
                total_out: rendicontoData?.summary?.totale?.totalOut || 0,
                risultato_periodo: rendicontoData?.summary?.totale?.saldo || 0,
                // Il saldo richiesto è la situazione economica del periodo:
                // entrate meno uscite, non la somma dei conti cassa/banca.
                saldo: rendicontoData?.summary?.totale?.saldo || 0,
                total_rows: rendicontoData?.summary?.totale?.rowsCount || 0,
            })
        } catch (err) {
            if (sequence !== loadSequenceRef.current) return
            console.error(err)
            setError('Impossibile caricare i dati della contabilità.')
        } finally {
            if (sequence === loadSequenceRef.current) {
                setLoading(false)
                setRefreshing(false)
            }
        }
    }
    const initialLoadRef = useRef(loadData)

    useEffect(() => {
        initialLoadRef.current()
        return () => {
            loadSequenceRef.current += 1
        }
    }, [])

    const filtersAreApplied =
        periodSelection === appliedFilters.periodSelection &&
        fromDate === appliedFilters.fromDate &&
        toDate === appliedFilters.toDate &&
        periodicity === appliedFilters.periodicity
    const selectedYear = appliedFilters.periodSelection === 'all' || appliedFilters.periodSelection === 'custom'
        ? null
        : Number(appliedFilters.periodSelection)
    const selectedYearRecord = selectedYear
        ? financialYears.find((item) => Number(item.year) === selectedYear) || normalizeFinancialYearRecord(null, selectedYear)
        : null
    const selectedPeriod = getFinancialPeriod(
        appliedFilters.periodSelection,
        appliedFilters.fromDate,
        appliedFilters.toDate
    )
    const selectedYearEnded = selectedYear
        ? !dayjs().isBefore(dayjs(getFinancialYearRange(selectedYear).fullToDate), 'day')
        : false

    function handlePeriodSelectionChange(value) {
        setPeriodSelection(value)

        if (value === 'custom') return

        const period = getFinancialPeriod(value, fromDate, toDate)
        setFromDate(period.fromDate)
        setToDate(period.toDate)
    }

    function handleCustomFromDateChange(value) {
        setFromDate(value)
    }

    function handleCustomToDateChange(value) {
        setToDate(value)
    }

    const alerts = useMemo(() => {
        if (!overview) return []

        const items = []

        if (overview?.lastSumupImportAt) {
            const importDate = new Date(overview.lastSumupImportAt)
            const now = new Date()
            const diffMs = now - importDate
            const diffDays = diffMs / (1000 * 60 * 60 * 24)

            if (diffDays > 7) {
                items.push({
                    type: 'warning',
                    text: 'L’ultimo import SumUp risale a più di 7 giorni fa.',
                })
            }
        } else {
            items.push({
                type: 'warning',
                text: 'Nessun import SumUp registrato.',
            })
        }

        if ((overview?.uncategorizedEntriesCount || 0) > 0) {
            items.push({
                type: 'warning',
                text: `Ci sono ${overview.uncategorizedEntriesCount} movimenti senza natura o classificazione completa.`,
            })
        }

        if (!items.length) {
            items.push({
                type: 'success',
                text: 'Nessuna anomalia contabile rilevata al momento.',
            })
        }

        return items
    }, [overview])

    const periodLabel = useMemo(() => {
        const from = dayjs(appliedFilters.fromDate).format('DD/MM/YYYY')
        const to = dayjs(appliedFilters.toDate).format('DD/MM/YYYY')
        return `${from}_${to}`
    }, [appliedFilters.fromDate, appliedFilters.toDate])

    const selectedYearCashBalance = selectedYearRecord
        ? selectedYearRecord.openingCashBalance + Number(rendiconto?.methodSummary?.cashBalance || 0)
        : 0
    const selectedYearBankBalance = selectedYearRecord
        ? selectedYearRecord.openingBankBalance + Number(rendiconto?.methodSummary?.bankBalance || 0)
        : 0
    const incompleteRows = useMemo(() => {
        return (rendiconto?.rows || []).filter((row) => {
            const hasAmount = Number(row.amount_in || 0) > 0 || Number(row.amount_out || 0) > 0
            return (
                !String(row.description || '').trim() ||
                !hasAmount ||
                !String(row.account_code || '').trim() ||
                !String(row.nature || '').trim()
            )
        })
    }, [rendiconto])

    function applySelectedPeriod() {
        if (!fromDate || !toDate || dayjs(fromDate).isAfter(dayjs(toDate), 'day')) {
            setError('Controlla l’intervallo: la data iniziale deve precedere quella finale.')
            return
        }
        loadData({ silent: true })
    }

    function openPositionModal() {
        if (!selectedYearRecord) return
        setFinancialActionError('')
        setPositionForm({
            openingCashBalance: String(selectedYearRecord.openingCashBalance || 0),
            openingBankBalance: String(selectedYearRecord.openingBankBalance || 0),
            openingReceivables: String(selectedYearRecord.openingReceivables || 0),
            openingPayables: String(selectedYearRecord.openingPayables || 0),
            currentReceivables: String(selectedYearRecord.currentReceivables || 0),
            currentPayables: String(selectedYearRecord.currentPayables || 0),
        })
        setPositionModalOpen(true)
    }

    async function handleSavePosition(event) {
        event.preventDefault()
        if (!selectedYear || selectedYearRecord?.status === 'closed') return

        try {
            setFinancialActionPending(true)
            setFinancialActionError('')
            await saveFinancialYearPosition({ year: selectedYear, ...positionForm })
            setPositionModalOpen(false)
            await loadData({ silent: true })
        } catch (actionError) {
            setFinancialActionError(actionError.message || 'Impossibile salvare i saldi.')
        } finally {
            setFinancialActionPending(false)
        }
    }

    function openClosingModal() {
        if (!filtersAreApplied || !selectedYearRecord || selectedYearRecord.status === 'closed' || !selectedYearEnded) return
        setFinancialActionError('')
        setCloseConfirmed(false)
        setClosingForm({
            closingCashBalance: String(selectedYearCashBalance || 0),
            closingBankBalance: String(selectedYearBankBalance || 0),
            closingReceivables: String(selectedYearRecord.currentReceivables || 0),
            closingPayables: String(selectedYearRecord.currentPayables || 0),
            note: '',
        })
        setClosingModalOpen(true)
    }

    async function handleCloseFinancialYear(event) {
        event.preventDefault()
        if (!selectedYear || !closeConfirmed) return

        try {
            setFinancialActionPending(true)
            setFinancialActionError('')
            await closeFinancialYear({ year: selectedYear, ...closingForm })
            setClosingModalOpen(false)
            await loadData({ silent: true })
        } catch (actionError) {
            setFinancialActionError(actionError.message || 'Impossibile chiudere l’esercizio.')
        } finally {
            setFinancialActionPending(false)
        }
    }

    async function handleReopenFinancialYear() {
        if (!selectedYear || !window.confirm(`Riaprire l’esercizio ${selectedYear}? I movimenti torneranno modificabili.`)) return

        try {
            setFinancialActionPending(true)
            setFinancialActionError('')
            await reopenFinancialYear(selectedYear)
            await loadData({ silent: true })
        } catch (actionError) {
            setError(actionError.message || 'Impossibile riaprire l’esercizio.')
        } finally {
            setFinancialActionPending(false)
        }
    }

    if (loading) {
        return (
            <section className="contabilita-page">
                <div className="contabilita-page__header">
                    <div>
                        <h1>Contabilità</h1>
                        <p>Risultati economici ufficiali calcolati dalla Prima nota nel periodo selezionato.</p>
                    </div>
                </div>

                <div className="contabilita-skeleton-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="contabilita-skeleton-card" />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section className="contabilita-page">
            <div className="contabilita-page__header">
                <div>
                    <h1>Contabilità</h1>
                    <p>Esercizi solari, rendiconto annuale e posizione finanziaria reale dell’associazione.</p>
                </div>

                <button
                    type="button"
                    className="contabilita-refresh-btn"
                    onClick={() => loadData({ silent: true })}
                    disabled={refreshing || !filtersAreApplied}
                    title={!filtersAreApplied ? 'Applica prima i nuovi filtri' : ''}
                >
                    <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                    Aggiorna
                </button>
            </div>

            <FilterBar
                periodSelection={periodSelection}
                financialYears={financialYears}
                onPeriodSelectionChange={handlePeriodSelectionChange}
                fromDate={fromDate}
                toDate={toDate}
                periodicity={periodicity}
                onFromDateChange={handleCustomFromDateChange}
                onToDateChange={handleCustomToDateChange}
                onPeriodicityChange={setPeriodicity}
                onApply={applySelectedPeriod}
            />

            {error ? (
                <div className="contabilita-banner contabilita-banner--error">
                    <CircleAlert size={18} />
                    <span>{error}</span>
                </div>
            ) : null}

            {!filtersAreApplied ? (
                <div className="contabilita-banner contabilita-banner--warning">
                    <CircleAlert size={18} />
                    <span>Hai modificato i filtri. Premi <strong>Applica</strong> per aggiornare riepiloghi, esportazioni e gestione dell’esercizio.</span>
                </div>
            ) : null}

            <div className="contabilita-stats-grid">
                <StatCard
                    title={selectedPeriod.mode === 'year' ? `Risultato esercizio ${selectedYear}` : 'Risultato del periodo'}
                    value={euro(filteredTotals?.saldo || 0)}
                    icon={Scale}
                    variant="primary"
                    subtitle="Avanzo o disavanzo: entrate meno uscite"
                />
                <StatCard
                    title="Liquidità attuale"
                    value={euro(financialPosition?.liquidity || 0)}
                    icon={PiggyBank}
                    variant="success"
                    subtitle="Cassa più banca, indipendente dal filtro"
                />
                <StatCard
                    title="Posizione finanziaria"
                    value={euro(financialPosition?.financialPosition || 0)}
                    icon={Landmark}
                    subtitle="Liquidità + crediti − debiti"
                />
                <StatCard
                    title="Entrate selezione"
                    value={euro(filteredTotals?.total_in || 0)}
                    icon={Banknote}
                    variant="success"
                    subtitle={`${appliedFilters.fromDate} → ${appliedFilters.toDate}`}
                />
                <StatCard
                    title="Uscite selezione"
                    value={euro(filteredTotals?.total_out || 0)}
                    icon={Receipt}
                    variant="danger"
                    subtitle={`${filteredTotals?.total_rows || 0} movimenti complessivi`}
                />
                <StatCard
                    title="Saldo IVA"
                    value={euro(ivaSummary?.balance || 0)}
                    icon={FileSpreadsheet}
                    subtitle="Debito IVA meno credito IVA nel periodo"
                />
            </div>

            <div className="contabilita-banner contabilita-banner--info">
                <CircleAlert size={18} />
                <span>Il saldo iniziale di banca e cassa <strong>non è registrato come entrata</strong>: contribuisce alla liquidità, mentre il risultato dell’esercizio resta calcolato solo come entrate meno uscite.</span>
            </div>

            {!financialYears.length ? (
                <div className="contabilita-banner contabilita-banner--warning">
                    <CircleAlert size={18} />
                    <span>La gestione degli esercizi non è ancora attiva nel database. Applica la migrazione <strong>202607170001_financial_years.sql</strong> prima di configurare o chiudere un anno.</span>
                </div>
            ) : null}

            <div className="contabilita-card financial-year-card">
                <div className="financial-year-card__header">
                    <div className="financial-year-card__title">
                        <span className="financial-year-card__icon">
                            {selectedYearRecord?.status === 'closed' ? <LockKeyhole size={22} /> : <CalendarRange size={22} />}
                        </span>
                        <div>
                            <div className="financial-year-card__eyebrow">Gestione esercizio</div>
                            <h2>{selectedYear ? `Esercizio finanziario ${selectedYear}` : selectedPeriod.label}</h2>
                            <p>
                                {selectedYear
                                    ? `${dayjs(getFinancialYearRange(selectedYear).fromDate).format('DD/MM/YYYY')} – 31/12/${selectedYear}`
                                    : 'Vista di consultazione: non modifica lo stato dei singoli esercizi.'}
                            </p>
                        </div>
                    </div>

                    {selectedYear ? (
                        <div className="financial-year-card__actions">
                            <span className={`financial-year-status financial-year-status--${selectedYearRecord?.status || 'open'}`}>
                                {selectedYearRecord?.status === 'closed' ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}
                                {selectedYearRecord?.status === 'closed' ? 'Chiuso' : 'Aperto'}
                            </span>
                            {selectedYearRecord?.status === 'closed' ? (
                                <button
                                    type="button"
                                    className="contabilita-link-btn contabilita-link-btn--warning"
                                    onClick={handleReopenFinancialYear}
                                    disabled={!filtersAreApplied || financialActionPending}
                                >
                                    <RotateCcw size={16} /> Riapri esercizio
                                </button>
                            ) : (
                                <>
                                    <button type="button" className="contabilita-link-btn" onClick={openPositionModal} disabled={!filtersAreApplied}>
                                        <Settings2 size={16} /> Saldi e posizioni
                                    </button>
                                    <button
                                        type="button"
                                        className="contabilita-close-year-btn"
                                        onClick={openClosingModal}
                                        disabled={!filtersAreApplied || !selectedYearEnded || financialActionPending}
                                        title={!filtersAreApplied ? 'Applica prima i nuovi filtri' : !selectedYearEnded ? `Disponibile dal 31/12/${selectedYear}` : ''}
                                    >
                                        <LockKeyhole size={16} /> Chiudi esercizio {selectedYear}
                                    </button>
                                </>
                            )}
                        </div>
                    ) : null}
                </div>

                {selectedYear ? (
                    <div className="financial-year-card__body">
                        <div className="financial-year-position-grid">
                            <div><span>Liquidità iniziale</span><strong>{euro((selectedYearRecord?.openingCashBalance || 0) + (selectedYearRecord?.openingBankBalance || 0))}</strong><small>Cassa e banca riportate</small></div>
                            <div><span>Crediti aperti</span><strong>{euro(selectedYearRecord?.currentReceivables || 0)}</strong><small>Ancora da incassare</small></div>
                            <div><span>Debiti aperti</span><strong>{euro(selectedYearRecord?.currentPayables || 0)}</strong><small>Ancora da pagare</small></div>
                            <div><span>Risultato selezionato</span><strong>{euro(filteredTotals?.risultato_periodo || 0)}</strong><small>Non genera un’entrata di riporto</small></div>
                        </div>

                        {selectedYearRecord?.status === 'closed' ? (
                            <div className="financial-year-closed-summary">
                                <CheckCircle2 size={20} />
                                <span>
                                    Chiuso il {selectedYearRecord.closedAt ? dayjs(selectedYearRecord.closedAt).format('DD/MM/YYYY [alle] HH:mm') : '—'}.
                                    Snapshot: entrate <strong>{euro(selectedYearRecord.totalIncome)}</strong>, uscite <strong>{euro(selectedYearRecord.totalExpenses)}</strong>, risultato <strong>{euro(selectedYearRecord.result)}</strong>.
                                </span>
                            </div>
                        ) : !selectedYearEnded ? (
                            <div className="financial-year-open-note">
                                <CircleAlert size={18} /> La chiusura sarà disponibile dal 31 dicembre {selectedYear}. Fino ad allora Nova aggiorna automaticamente il risultato dell’esercizio.
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="financial-year-open-note">
                        <CircleAlert size={18} /> Seleziona un singolo anno per configurare saldi iniziali, chiudere o riaprire l’esercizio.
                    </div>
                )}
            </div>

            <div className="contabilita-layout">
                <div className="contabilita-main">
                    <div className="contabilita-card">
                        <div className="contabilita-card__header">
                            <div>
                                <h2>Accesso rapido</h2>
                                <p>Le aree che userai più spesso nella gestione quotidiana.</p>
                            </div>
                        </div>

                        <div className="contabilita-actions-grid">
                            <QuickAction
                                to="/prima-nota"
                                title="Prima nota"
                                description="Inserisci, modifica e controlla i movimenti."
                                icon={Receipt}
                            />
                            <QuickAction
                                to="/conti"
                                title="Conti"
                                description="Verifica saldo cassa ed elettronici."
                                icon={Wallet}
                            />
                            <QuickAction
                                to="/fatturazione"
                                title="Fatturazione"
                                description="Gestisci fatture emesse e dati cliente."
                                icon={FileSpreadsheet}
                            />
                            <QuickAction
                                to="/amministrazione"
                                title="Amministrazione"
                                description="Utenti, permessi e configurazioni generali."
                                icon={Building2}
                            />
                        </div>
                    </div>

                    <div className="contabilita-card contabilita-card--full-main">
                        <div className="contabilita-card__header">
                            <div>
                                <h2>Rendiconto gestionale ASD</h2>
                                <p>Periodo selezionato: {dayjs(appliedFilters.fromDate).format('DD/MM/YYYY')} - {dayjs(appliedFilters.toDate).format('DD/MM/YYYY')}</p>
                            </div>

                            <div className="contabilita-export-actions">
                                <button
                                    type="button"
                                    className="contabilita-link-btn"
                                    onClick={() =>
                                        exportRendicontoExcel({
                                            periodLabel,
                                            rendiconto,
                                        })
                                    }
                                >
                                    <Download size={16} />
                                    Excel
                                </button>
                                <button
                                    type="button"
                                    className="contabilita-link-btn"
                                    onClick={() =>
                                        exportRendicontoPdf({
                                            periodLabel,
                                            rendiconto,
                                            organization: {
                                                name: 'Club Orchidea asd',
                                                address: 'Via Giuseppe Ungaretti 34',
                                                city: '21047 Saronno (VA)',
                                                email: 'info@orchideaclub.it',
                                                taxCode: '',
                                                vatNumber: '14275140961',
                                            },
                                        })
                                    }
                                >
                                    <Download size={16} />
                                    PDF
                                </button>
                            </div>
                        </div>

                        {!rendiconto ? (
                            <EmptyState
                                title="Nessun dato disponibile"
                                description="Applica un periodo valido per generare il rendiconto."
                            />
                        ) : (
                            <>
                                <div className="contabilita-summary-grid contabilita-summary-grid--triple">
                                    <StatCard
                                        title="Entrate istituzionali"
                                        value={euro(rendiconto.summary.istituzionale.totalIn)}
                                        icon={Banknote}
                                        subtitle={`${rendiconto.summary.istituzionale.rowsCount} movimenti`}
                                    />
                                    <StatCard
                                        title="Uscite istituzionali"
                                        value={euro(rendiconto.summary.istituzionale.totalOut)}
                                        icon={Receipt}
                                        subtitle={`Saldo ${euro(rendiconto.summary.istituzionale.saldo)}`}
                                    />
                                    <StatCard
                                        title="Saldo istituzionale"
                                        value={euro(rendiconto.summary.istituzionale.saldo)}
                                        icon={Wallet}
                                        subtitle="Periodo selezionato"
                                    />

                                    <StatCard
                                        title="Entrate commerciali"
                                        value={euro(rendiconto.summary.commerciale.totalIn)}
                                        icon={Banknote}
                                        subtitle={`${rendiconto.summary.commerciale.rowsCount} movimenti`}
                                    />
                                    <StatCard
                                        title="Uscite commerciali"
                                        value={euro(rendiconto.summary.commerciale.totalOut)}
                                        icon={Receipt}
                                        subtitle={`Saldo ${euro(rendiconto.summary.commerciale.saldo)}`}
                                    />
                                    <StatCard
                                        title="Saldo commerciale"
                                        value={euro(rendiconto.summary.commerciale.saldo)}
                                        icon={Wallet}
                                        subtitle="Periodo selezionato"
                                    />
                                </div>

                                <div className="contabilita-table-wrap">
                                    <table className="contabilita-table">
                                        <thead>
                                            <tr>
                                                <th>Sezione</th>
                                                <th>Entrate</th>
                                                <th>Uscite</th>
                                                <th>Saldo</th>
                                                <th>Movimenti</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Istituzionale</td>
                                                <td className="is-income">{euro(rendiconto.summary.istituzionale.totalIn)}</td>
                                                <td className="is-expense">{euro(rendiconto.summary.istituzionale.totalOut)}</td>
                                                <td>{euro(rendiconto.summary.istituzionale.saldo)}</td>
                                                <td>{rendiconto.summary.istituzionale.rowsCount}</td>
                                            </tr>
                                            <tr>
                                                <td>Commerciale</td>
                                                <td className="is-income">{euro(rendiconto.summary.commerciale.totalIn)}</td>
                                                <td className="is-expense">{euro(rendiconto.summary.commerciale.totalOut)}</td>
                                                <td>{euro(rendiconto.summary.commerciale.saldo)}</td>
                                                <td>{rendiconto.summary.commerciale.rowsCount}</td>
                                            </tr>
                                            <tr>
                                                <td>Non classificate</td>
                                                <td className="is-income">{euro(rendiconto.summary.nonClassificate.totalIn)}</td>
                                                <td className="is-expense">{euro(rendiconto.summary.nonClassificate.totalOut)}</td>
                                                <td>{euro(rendiconto.summary.nonClassificate.saldo)}</td>
                                                <td>{rendiconto.summary.nonClassificate.rowsCount}</td>
                                            </tr>
                                            <tr className="contabilita-table__total">
                                                <td>Totale</td>
                                                <td className="is-income">{euro(rendiconto.summary.totale.totalIn)}</td>
                                                <td className="is-expense">{euro(rendiconto.summary.totale.totalOut)}</td>
                                                <td>{euro(rendiconto.summary.totale.saldo)}</td>
                                                <td>{rendiconto.summary.totale.rowsCount}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="contabilita-card">
                        <div className="contabilita-card__header">
                            <div>
                                <h2>Scadenziario IVA</h2>
                                <p>Periodicità {appliedFilters.periodicity === 'quarterly' ? 'trimestrale' : 'mensile'} sul periodo selezionato.</p>
                            </div>

                            <div className="contabilita-export-actions">
                                <button
                                    type="button"
                                    className="contabilita-link-btn"
                                    onClick={() => exportIvaExcel({ periodLabel, scadenziario: ivaScadenziario })}
                                >
                                    <Download size={16} />
                                    Excel
                                </button>
                                <button
                                    type="button"
                                    className="contabilita-link-btn"
                                    onClick={() => exportIvaPdf({ periodLabel, scadenziario: ivaScadenziario })}
                                >
                                    <Download size={16} />
                                    PDF
                                </button>
                            </div>
                        </div>

                        {!ivaSummary || !ivaScadenziario ? (
                            <EmptyState
                                title="Nessun dato IVA"
                                description="Non risultano movimenti IVA per il periodo selezionato."
                            />
                        ) : (
                            <>
                                <div className="contabilita-summary-grid">
                                    <StatCard
                                        title="IVA a debito"
                                        value={euro(ivaSummary.vatDebit)}
                                        icon={FileSpreadsheet}
                                        subtitle="Totale periodo"
                                    />
                                    <StatCard
                                        title="IVA a credito"
                                        value={euro(ivaSummary.vatCredit)}
                                        icon={Landmark}
                                        subtitle="Totale periodo"
                                    />
                                    <StatCard
                                        title="Saldo IVA"
                                        value={euro(ivaSummary.balance)}
                                        icon={Wallet}
                                        subtitle="Debito - credito"
                                    />
                                </div>

                                <div className="contabilita-table-wrap">
                                    <table className="contabilita-table">
                                        <thead>
                                            <tr>
                                                <th>Periodo</th>
                                                <th>IVA a debito</th>
                                                <th>IVA a credito</th>
                                                <th>Saldo</th>
                                                <th>Movimenti</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(ivaScadenziario.periods || []).map((item) => (
                                                <tr key={item.key}>
                                                    <td>{item.label}</td>
                                                    <td className="is-expense">{euro(item.vatDebit)}</td>
                                                    <td className="is-income">{euro(item.vatCredit)}</td>
                                                    <td>{euro(item.balance)}</td>
                                                    <td>{item.rows?.length || 0}</td>
                                                </tr>
                                            ))}
                                            <tr className="contabilita-table__total">
                                                <td>Totale</td>
                                                <td className="is-expense">{euro(ivaScadenziario.totals.vatDebit)}</td>
                                                <td className="is-income">{euro(ivaScadenziario.totals.vatCredit)}</td>
                                                <td>{euro(ivaScadenziario.totals.balance)}</td>
                                                <td>
                                                    {(ivaScadenziario.periods || []).reduce(
                                                        (acc, item) => acc + (item.rows?.length || 0),
                                                        0
                                                    )}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="contabilita-card">
                        <div className="contabilita-card__header">
                            <div>
                                <h2>Ultimi movimenti</h2>
                                <p>Anteprima delle ultime registrazioni presenti in prima nota.</p>
                            </div>
                            <Link to="/prima-nota" className="contabilita-link-btn">
                                Vai a prima nota
                            </Link>
                        </div>

                        {!recentEntries.length ? (
                            <EmptyState
                                title="Nessun movimento recente"
                                description="Quando inizierai a registrare o importare movimenti, li vedrai qui."
                            />
                        ) : (
                            <div className="contabilita-table-wrap">
                                <table className="contabilita-table">
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Descrizione</th>
                                            <th>Conto</th>
                                            <th>Entrata</th>
                                            <th>Uscita</th>
                                            <th>Natura</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentEntries.map((entry) => (
                                            <tr key={entry.id}>
                                                <td>{entry.dateLabel}</td>
                                                <td className="contabilita-table__description">{entry.description || '-'}</td>
                                                <td>{entry.accountCode || '-'}</td>
                                                <td className="is-income">{entry.amountIn ? euro(entry.amountIn) : '-'}</td>
                                                <td className="is-expense">{entry.amountOut ? euro(entry.amountOut) : '-'}</td>
                                                <td>
                                                    <span className={`nature-badge nature-badge--${entry.natureKey || 'default'}`}>
                                                        {entry.natureLabel || '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className="contabilita-side">
                    <div className="contabilita-card">
                        <div className="contabilita-card__header">
                            <div>
                                <h2>Alert contabili</h2>
                                <p>Controlli rapidi su anomalie e dati mancanti.</p>
                            </div>
                        </div>

                        <div className="contabilita-alerts">
                            {alerts.map((alert, index) => (
                                <div
                                    key={`${alert.type}-${index}`}
                                    className={`contabilita-alert contabilita-alert--${alert.type}`}
                                >
                                    <CircleAlert size={16} />
                                    <span>{alert.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="contabilita-card contabilita-card--full">
                <div className="contabilita-card__header">
                    <div>
                        <h2>Posizione finanziaria attuale</h2>
                        <p>Situazione reale al {dayjs(financialPosition?.toDate).format('DD/MM/YYYY')}, indipendente dall’anno visualizzato sopra.</p>
                    </div>
                </div>

                <div className="contabilita-account-list contabilita-account-list--grid">
                    <div className="contabilita-account-row">
                        <span>Cassa (contanti)</span>
                        <strong>{euro(financialPosition?.cashBalance || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Banca / elettronici</span>
                        <strong>{euro(financialPosition?.bankBalance || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Liquidità totale</span>
                        <strong>{euro(financialPosition?.liquidity || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Crediti aperti</span>
                        <strong>{euro(financialPosition?.receivables || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Debiti aperti</span>
                        <strong>{euro(financialPosition?.payables || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row contabilita-account-row--accent">
                        <span>Posizione finanziaria</span>
                        <strong>{euro(financialPosition?.financialPosition || 0)}</strong>
                    </div>
                </div>
            </div>

            {positionModalOpen ? (
                <div className="financial-modal-overlay" onMouseDown={() => setPositionModalOpen(false)}>
                    <div className="financial-modal" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="financial-modal__header">
                            <div><h3>Saldi e posizioni {selectedYear}</h3><p>Configura i valori che non devono diventare entrate dell’esercizio.</p></div>
                            <button type="button" onClick={() => setPositionModalOpen(false)}><X size={18} /></button>
                        </div>
                        <form className="financial-modal__form" onSubmit={handleSavePosition}>
                            <div className="financial-modal__section">
                                <h4>Situazione iniziale al {dayjs(getFinancialYearRange(selectedYear).fromDate).format('DD/MM/YYYY')}</h4>
                                <p>Questi importi costituiscono patrimonio/liquidità iniziale, non ricavi.</p>
                                <div className="financial-modal__grid">
                                    <label>Cassa iniziale (€)<input type="number" step="0.01" value={positionForm.openingCashBalance} onChange={(event) => setPositionForm({ ...positionForm, openingCashBalance: event.target.value })} /></label>
                                    <label>Banca iniziale (€)<input type="number" step="0.01" value={positionForm.openingBankBalance} onChange={(event) => setPositionForm({ ...positionForm, openingBankBalance: event.target.value })} /></label>
                                    <label>Crediti iniziali (€)<input type="number" min="0" step="0.01" value={positionForm.openingReceivables} onChange={(event) => setPositionForm({ ...positionForm, openingReceivables: event.target.value })} /></label>
                                    <label>Debiti iniziali (€)<input type="number" min="0" step="0.01" value={positionForm.openingPayables} onChange={(event) => setPositionForm({ ...positionForm, openingPayables: event.target.value })} /></label>
                                </div>
                            </div>
                            <div className="financial-modal__section">
                                <h4>Crediti e debiti attualmente aperti</h4>
                                <p>Aggiornali quando una posizione viene incassata o pagata.</p>
                                <div className="financial-modal__grid">
                                    <label>Crediti ancora da incassare (€)<input type="number" min="0" step="0.01" value={positionForm.currentReceivables} onChange={(event) => setPositionForm({ ...positionForm, currentReceivables: event.target.value })} /></label>
                                    <label>Debiti ancora da pagare (€)<input type="number" min="0" step="0.01" value={positionForm.currentPayables} onChange={(event) => setPositionForm({ ...positionForm, currentPayables: event.target.value })} /></label>
                                </div>
                            </div>
                            {financialActionError ? <div className="contabilita-banner contabilita-banner--error"><CircleAlert size={17} /> {financialActionError}</div> : null}
                            <div className="financial-modal__actions"><button type="button" className="contabilita-refresh-btn" onClick={() => setPositionModalOpen(false)}>Annulla</button><button type="submit" className="contabilita-apply-btn" disabled={financialActionPending}>{financialActionPending ? 'Salvataggio…' : 'Salva posizione'}</button></div>
                        </form>
                    </div>
                </div>
            ) : null}

            {closingModalOpen ? (
                <div className="financial-modal-overlay" onMouseDown={() => setClosingModalOpen(false)}>
                    <div className="financial-modal financial-modal--large" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="financial-modal__header financial-modal__header--closing">
                            <div><h3>Chiudi esercizio {selectedYear}</h3><p>Nova congelerà il rendiconto e bloccherà i movimenti fino a eventuale riapertura.</p></div>
                            <button type="button" onClick={() => setClosingModalOpen(false)}><X size={18} /></button>
                        </div>
                        <form className="financial-modal__form" onSubmit={handleCloseFinancialYear}>
                            <div className="financial-close-checks">
                                <div className="is-ok"><CheckCircle2 size={18} /><span><strong>{filteredTotals?.total_rows || 0}</strong> movimenti controllati</span></div>
                                <div className={incompleteRows.length ? 'is-warning' : 'is-ok'}><CircleAlert size={18} /><span><strong>{incompleteRows.length}</strong> movimenti incompleti o da classificare</span></div>
                                <div className="is-ok"><FileSpreadsheet size={18} /><span>Rendiconto PDF ed Excel disponibili nella pagina</span></div>
                            </div>

                            <div className="financial-modal__section">
                                <h4>Saldi reali al 31/12/{selectedYear}</h4>
                                <p>Verifica gli importi con estratto conto e cassa fisica prima della conferma.</p>
                                <div className="financial-modal__grid">
                                    <label>Cassa finale (€)<input type="number" step="0.01" value={closingForm.closingCashBalance} onChange={(event) => setClosingForm({ ...closingForm, closingCashBalance: event.target.value })} /></label>
                                    <label>Banca finale (€)<input type="number" step="0.01" value={closingForm.closingBankBalance} onChange={(event) => setClosingForm({ ...closingForm, closingBankBalance: event.target.value })} /></label>
                                    <label>Crediti da riportare (€)<input type="number" min="0" step="0.01" value={closingForm.closingReceivables} onChange={(event) => setClosingForm({ ...closingForm, closingReceivables: event.target.value })} /></label>
                                    <label>Debiti da riportare (€)<input type="number" min="0" step="0.01" value={closingForm.closingPayables} onChange={(event) => setClosingForm({ ...closingForm, closingPayables: event.target.value })} /></label>
                                </div>
                                <label className="financial-modal__note">Nota di chiusura<textarea value={closingForm.note} onChange={(event) => setClosingForm({ ...closingForm, note: event.target.value })} placeholder="Eventuali annotazioni per il direttivo…" /></label>
                            </div>

                            <div className="financial-close-result">
                                <span>Entrate {euro(filteredTotals?.total_in || 0)}</span><span>Uscite {euro(filteredTotals?.total_out || 0)}</span><strong>Avanzo/disavanzo {euro(filteredTotals?.saldo || 0)}</strong>
                            </div>
                            <label className="financial-confirm"><input type="checkbox" checked={closeConfirmed} onChange={(event) => setCloseConfirmed(event.target.checked)} /><span>Confermo di aver verificato saldi, movimenti incompleti, crediti e debiti. L’avanzo non verrà creato come nuova entrata.</span></label>
                            {financialActionError ? <div className="contabilita-banner contabilita-banner--error"><CircleAlert size={17} /> {financialActionError}</div> : null}
                            <div className="financial-modal__actions"><button type="button" className="contabilita-refresh-btn" onClick={() => setClosingModalOpen(false)}>Annulla</button><button type="submit" className="contabilita-close-year-btn" disabled={!closeConfirmed || financialActionPending}><LockKeyhole size={16} /> {financialActionPending ? 'Chiusura…' : `Chiudi esercizio ${selectedYear}`}</button></div>
                        </form>
                    </div>
                </div>
            ) : null}

        </section>
    )
}
