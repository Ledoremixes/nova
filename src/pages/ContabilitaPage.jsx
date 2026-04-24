import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
    ArrowRight,
    Banknote,
    Building2,
    CalendarRange,
    CircleAlert,
    Download,
    FileSpreadsheet,
    Landmark,
    Receipt,
    RefreshCw,
    Wallet,
} from 'lucide-react'
import '../styles/ContabilitaPage.css'
import {
    euro,
    fetchContabilitaOverview,
    fetchRecentAccountingEntries,
    fetchRendicontoGestionale,
    fetchIvaSummary,
    fetchIvaScadenziario,
} from '../api/contabilita'
import {
    exportIvaExcel,
    exportIvaPdf,
    exportRendicontoExcel,
    exportRendicontoPdf,
} from '../utils/contabilitaExport'
import { fetchEntriesFilteredTotals } from '../api/entries'

const today = dayjs().format('YYYY-MM-DD')
const startYear = dayjs().startOf('year').format('YYYY-MM-DD')

function StatCard({ title, value, icon: Icon, variant = 'default', subtitle }) {
    return (
        <div className={`contabilita-stat contabilita-stat--${variant}`}>
            <div className="contabilita-stat__icon">
                <Icon size={20} />
            </div>
            <div className="contabilita-stat__content">
                <div className="contabilita-stat__title">{title}</div>
                <div className="contabilita-stat__value">{value}</div>
                {subtitle ? <div className="contabilita-stat__subtitle">{subtitle}</div> : null}
            </div>
        </div>
    )
}

function QuickAction({ to, title, description, icon: Icon }) {
    return (
        <Link to={to} className="contabilita-action">
            <div className="contabilita-action__icon">
                <Icon size={18} />
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
            <div className="contabilita-filterbar__field">
                <label>Dal</label>
                <input type="date" value={fromDate} onChange={(e) => onFromDateChange(e.target.value)} />
            </div>

            <div className="contabilita-filterbar__field">
                <label>Al</label>
                <input type="date" value={toDate} onChange={(e) => onToDateChange(e.target.value)} />
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

    const [fromDate, setFromDate] = useState(startYear)
    const [toDate, setToDate] = useState(today)
    const [periodicity, setPeriodicity] = useState('quarterly')

    const loadData = async ({ silent = false } = {}) => {
        try {
            setError('')
            if (silent) setRefreshing(true)
            else setLoading(true)

            const [
                overviewData,
                entriesData,
                rendicontoData,
                ivaData,
                ivaScadData,
                totalsData,
            ] = await Promise.all([
                fetchContabilitaOverview(),
                fetchRecentAccountingEntries(8),
                fetchRendicontoGestionale({ fromDate, toDate }),
                fetchIvaSummary({ fromDate, toDate }),
                fetchIvaScadenziario({ fromDate, toDate, periodicity }),
                fetchEntriesFilteredTotals({
                    search: '',
                    fromDate,
                    fromTime: '00:00',
                    toDate,
                    toTime: '23:59',
                    onlyWithoutAccount: false,
                    accountCode: '',
                    ivaFilter: '',
                }),
            ])

            setOverview(overviewData)
            setRecentEntries(entriesData)
            setRendiconto(rendicontoData)
            setIvaSummary(ivaData)
            setIvaScadenziario(ivaScadData)
            setFilteredTotals(totalsData)

        } catch (err) {
            console.error(err)
            setError('Impossibile caricare i dati della contabilità.')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

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
        const from = dayjs(fromDate).format('DD/MM/YYYY')
        const to = dayjs(toDate).format('DD/MM/YYYY')
        return `${from}_${to}`
    }, [fromDate, toDate])

    if (loading) {
        return (
            <section className="contabilita-page">
                <div className="contabilita-page__header">
                    <div>
                        <h1>Contabilità</h1>
                        <p>Panoramica economica, IVA, conti e accesso rapido alle funzioni principali.</p>
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
                    <p>Panoramica economica, IVA, conti e accesso rapido alle funzioni principali.</p>
                </div>

                <button
                    type="button"
                    className="contabilita-refresh-btn"
                    onClick={() => loadData({ silent: true })}
                    disabled={refreshing}
                >
                    <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                    Aggiorna
                </button>
            </div>

            <FilterBar
                fromDate={fromDate}
                toDate={toDate}
                periodicity={periodicity}
                onFromDateChange={setFromDate}
                onToDateChange={setToDate}
                onPeriodicityChange={setPeriodicity}
                onApply={() => loadData({ silent: true })}
            />

            {error ? (
                <div className="contabilita-banner contabilita-banner--error">
                    <CircleAlert size={18} />
                    <span>{error}</span>
                </div>
            ) : null}

            <div className="contabilita-stats-grid">
                <StatCard
                    title="Saldo periodo"
                    value={euro(filteredTotals?.saldo || 0)}
                    icon={Wallet}
                    variant="primary"
                    subtitle="Periodo selezionato"
                />
                <StatCard
                    title="Entrate periodo"
                    value={euro(filteredTotals?.total_in || 0)}
                    icon={Banknote}
                    variant="success"
                    subtitle="Stessa logica della prima nota"
                />
                <StatCard
                    title="Uscite periodo"
                    value={euro(filteredTotals?.total_out || 0)}
                    icon={Receipt}
                    variant="danger"
                    subtitle="Stessa logica della prima nota"
                />
                <StatCard
                    title="IVA a debito"
                    value={euro(overview?.vatDebit || 0)}
                    icon={FileSpreadsheet}
                    subtitle="Periodo anno corrente"
                />
                <StatCard
                    title="IVA a credito"
                    value={euro(overview?.vatCredit || 0)}
                    icon={Landmark}
                    subtitle="Periodo anno corrente"
                />
                <StatCard
                    title="Ultimo import SumUp"
                    value={overview?.lastSumupImportLabel || 'Non disponibile'}
                    icon={CalendarRange}
                    subtitle={`${overview?.lastSumupImportRows || 0} righe ultimo import`}
                />
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
                                <p>Periodo selezionato: {dayjs(fromDate).format('DD/MM/YYYY')} - {dayjs(toDate).format('DD/MM/YYYY')}</p>
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
                                <p>Periodicità {periodicity === 'quarterly' ? 'trimestrale' : 'mensile'} sul periodo selezionato.</p>
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
                        <h2>Stato metodi</h2>
                        <p>Saldo per contanti ed elettronici.</p>
                    </div>
                </div>

                <div className="contabilita-account-list contabilita-account-list--grid">
                    <div className="contabilita-account-row">
                        <span>Cassa (contanti)</span>
                        <strong>{euro(overview?.cashBalance || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Banca / elettronici</span>
                        <strong>{euro(overview?.bankBalance || 0)}</strong>
                    </div>
                    <div className="contabilita-account-row">
                        <span>Saldo complessivo</span>
                        <strong>{euro(overview?.allAccountsBalance || 0)}</strong>
                    </div>
                </div>
            </div>

        </section>
    )
}