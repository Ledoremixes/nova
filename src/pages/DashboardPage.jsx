import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import {
  fetchDashboardStats,
  fetchDashboardAndamentoMensile,
  fetchBarTopItems,
  fetchDashboardRegistry,
} from '../api/dashboard'
import StatCard from '../components/ui/StatCard'

function euro(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('it-IT')
}

export default function DashboardPage() {
  const { user } = useAuth()

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: () => fetchDashboardStats(user.id),
    enabled: !!user?.id,
  })

  const andamentoQuery = useQuery({
    queryKey: ['dashboard-andamento', user?.id],
    queryFn: () => fetchDashboardAndamentoMensile(user.id),
    enabled: !!user?.id,
  })

  const barItemsQuery = useQuery({
    queryKey: ['dashboard-bar-items', user?.id],
    queryFn: () => fetchBarTopItems(user.id),
    enabled: !!user?.id,
  })

  const registryQuery = useQuery({
    queryKey: ['dashboard-registry', user?.id],
    queryFn: () => fetchDashboardRegistry(user.id),
    enabled: !!user?.id,
  })

  const isLoading =
    statsQuery.isLoading ||
    andamentoQuery.isLoading ||
    barItemsQuery.isLoading ||
    registryQuery.isLoading

  const error =
    statsQuery.error ||
    andamentoQuery.error ||
    barItemsQuery.error ||
    registryQuery.error

  if (isLoading) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Dashboard</h2>
          <p>Caricamento dati in corso...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Dashboard</h2>
          <p>Errore: {error.message}</p>
        </div>
      </section>
    )
  }

  const stats = statsQuery.data
  const andamento = andamentoQuery.data || []
  const barItems = barItemsQuery.data || []
  const registry = registryQuery.data

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Panoramica</div>
          <h2 className="dashboard-hero__title">Benvenuto nel nuovo gestionale Nova</h2>
          <p className="dashboard-hero__text">
            Dashboard completa con statistiche, andamento mensile, top articoli bar e ultimi tesserati.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Entrate" value={euro(stats.totalEntrate)} hint="Totale entrate" accent />
        <StatCard title="Uscite" value={euro(stats.totalUscite)} hint="Totale uscite" />
        <StatCard title="Saldo" value={euro(stats.saldo)} hint="Entrate - uscite" />
        <StatCard title="Movimenti" value={stats.totalMovements} hint="Prima nota" />
      </div>

      <div className="stats-grid">
        <StatCard title="Tesserati" value={registry.totalTesserati} hint="Totale registrati" />
        <StatCard title="Insegnanti" value={registry.totalInsegnanti} hint="Totale insegnanti" />
        <StatCard title="Conti usati" value={stats.byAccount.length} hint="Codici conto presenti" />
        <StatCard title="Top articoli bar" value={barItems.length} hint="Elementi con incasso" />
      </div>

      <div className="dashboard-grid">
        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Andamento mensile</h3>
              <p>Entrate e uscite raggruppate per mese</p>
            </div>
          </div>

          {andamento.length === 0 ? (
            <div className="empty-box">Nessun dato disponibile.</div>
          ) : (
            <div className="simple-list">
              {andamento.map((item) => (
                <div className="simple-list__row" key={item.month}>
                  <div>
                    <div className="simple-list__title">{item.month}</div>
                    <div className="simple-list__meta">
                      Entrate: {euro(item.entrate)} · Uscite: {euro(item.uscite)}
                    </div>
                  </div>
                  <div className="status-badge">
                    {euro(item.entrate - item.uscite)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Top articoli bar</h3>
              <p>I prodotti con maggior incasso</p>
            </div>
          </div>

          {barItems.length === 0 ? (
            <div className="empty-box">Nessun articolo bar disponibile.</div>
          ) : (
            <div className="simple-list">
              {barItems.map((item, index) => (
                <div className="simple-list__row" key={`${item.label}-${index}`}>
                  <div>
                    <div className="simple-list__title">{item.label}</div>
                    <div className="simple-list__meta">{item.count} movimenti</div>
                  </div>
                  <div className="status-badge">{euro(item.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Ultimi tesserati</h3>
              <p>Ultimi inserimenti anagrafici</p>
            </div>
          </div>

          {registry.ultimiTesserati.length === 0 ? (
            <div className="empty-box">Nessun tesserato presente.</div>
          ) : (
            <div className="simple-list">
              {registry.ultimiTesserati.map((item) => (
                <div className="simple-list__row" key={item.id}>
                  <div>
                    <div className="simple-list__title">{item.nomeCompleto || 'Senza nome'}</div>
                    <div className="simple-list__meta">
                      {formatDate(item.createdAt)} · Anno {item.anno}
                    </div>
                  </div>
                  <div className="status-badge">{item.tipo}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Ripartizione per conto</h3>
              <p>Entrate e uscite per account code</p>
            </div>
          </div>

          {stats.byAccount.length === 0 ? (
            <div className="empty-box">Nessun conto disponibile.</div>
          ) : (
            <div className="simple-list">
              {stats.byAccount.map((item, index) => (
                <div className="simple-list__row" key={`${item.code}-${index}`}>
                  <div>
                    <div className="simple-list__title">{item.code}</div>
                    <div className="simple-list__meta">
                      Entrate: {euro(item.entrate)} · Uscite: {euro(item.uscite)}
                    </div>
                  </div>
                  <div className="status-badge">
                    {euro(Number(item.entrate || 0) - Number(item.uscite || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}