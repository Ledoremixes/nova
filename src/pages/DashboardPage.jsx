import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { fetchDashboardRegistry } from '../api/dashboard'
import StatCard from '../components/ui/StatCard'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('it-IT')
}

function maxValue(rows, key = 'count') {
  return Math.max(1, ...rows.map((row) => Number(row[key] || 0)))
}

function MiniBarList({ rows = [], valueKey = 'count', empty = 'Nessun dato disponibile.' }) {
  const max = maxValue(rows, valueKey)
  if (!rows.length) return <div className="empty-box">{empty}</div>

  return (
    <div className="nova-dashboard-bars">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0)
        const width = Math.max(6, Math.round((value / max) * 100))
        return (
          <div className="nova-dashboard-bars__row" key={row.key || row.label}>
            <div className="nova-dashboard-bars__head">
              <strong>{row.label}</strong>
              <span>{value}</span>
            </div>
            {row.meta ? <small>{row.meta}</small> : null}
            <div className="nova-dashboard-bars__track"><i style={{ width: `${width}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const { user, role } = useAuth()
  const isAdmin = role === 'admin'

  const registryQuery = useQuery({
    queryKey: ['dashboard-registry', user?.id],
    queryFn: () => fetchDashboardRegistry(user.id),
    enabled: !!user?.id,
  })

  if (registryQuery.isLoading) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Dashboard</h2>
          <p>Caricamento dati operativi in corso...</p>
        </div>
      </section>
    )
  }

  if (registryQuery.error) {
    return (
      <section className="page">
        <div className="page-card">
          <h2>Dashboard</h2>
          <p>Errore: {registryQuery.error.message}</p>
        </div>
      </section>
    )
  }

  const registry = registryQuery.data || {
    totalTesserati: 0,
    totalTessereAttive: 0,
    totalCorsisti: 0,
    totalInsegnanti: 0,
    totalCorsi: 0,
    totalInAttesaPagamento: 0,
    registrationsByMonth: [],
    statusDistribution: [],
    topCourses: [],
    ultimiTesserati: [],
  }

  return (
    <section className="page nova-dashboard-page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Panoramica operativa</div>
          <h2 className="dashboard-hero__title">Nova Orchidea</h2>
          <p className="dashboard-hero__text">
            Qui trovi solo dati operativi: allievi, corsi, tesseramenti e attività della scuola. I valori economici sono spostati nella sezione Contabilità.
          </p>
        </div>
        <span className="nova-pill nova-pill--neutral">{isAdmin ? 'Vista admin' : 'Vista operatore'}</span>
      </div>

      <div className="stats-grid">
        <StatCard title="Tesserati" value={registry.totalTesserati} hint="Anagrafiche totali" accent />
        <StatCard title="Corsisti" value={registry.totalCorsisti} hint="Allievi collegati ai corsi" />
        <StatCard title="Tessere attive" value={registry.totalTessereAttive} hint="Tessere valide" />
        <StatCard title="Corsi" value={registry.totalCorsi} hint="Corsi configurati" />
        <StatCard title="Insegnanti" value={registry.totalInsegnanti} hint="Team didattico" />
        <StatCard title="Da verificare" value={registry.totalInAttesaPagamento} hint="Tessere/quote in attesa" />
      </div>

      <div className="dashboard-grid nova-dashboard-ops-grid">
        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Nuovi tesserati</h3>
              <p>Andamento degli ultimi 6 mesi.</p>
            </div>
          </div>
          <MiniBarList rows={registry.registrationsByMonth} />
        </div>

        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Stato allievi</h3>
              <p>Distribuzione tra corsisti, tesserati e situazioni da controllare.</p>
            </div>
          </div>
          <MiniBarList rows={registry.statusDistribution} valueKey="value" />
        </div>
      </div>

      <div className="dashboard-grid nova-dashboard-ops-grid">
        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Corsi più popolati</h3>
              <p>Partecipanti collegati ai corsi del portale allievi.</p>
            </div>
          </div>
          <MiniBarList rows={registry.topCourses} valueKey="value" empty="Nessun corso con partecipanti collegati." />
        </div>

        <div className="page-card">
          <div className="section-head">
            <div>
              <h3>Ultimi tesserati</h3>
              <p>Ultimi inserimenti anagrafici.</p>
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
                      {formatDate(item.createdAt)} · {item.numeroTessera || 'Senza tessera'} · Anno {item.anno}
                    </div>
                  </div>
                  <div className="status-badge">{item.tipo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
