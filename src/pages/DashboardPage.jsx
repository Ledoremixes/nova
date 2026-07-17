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

const chartColors = ['#7c3aed', '#ec4899', '#4f7cff', '#14b8a6', '#f59e0b', '#ef4444']

function smoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]
    const middleX = (previous.x + point.x) / 2
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`
  }, `M ${points[0].x} ${points[0].y}`)
}

function WaveAreaChart({ rows = [] }) {
  const width = 720
  const height = 280
  const padding = { top: 24, right: 24, bottom: 54, left: 42 }
  const baseline = height - padding.bottom
  const chartHeight = baseline - padding.top
  const maximum = maxValue(rows)
  const step = rows.length > 1 ? (width - padding.left - padding.right) / (rows.length - 1) : 0
  const points = rows.map((row, index) => {
    const value = Number(row.count || 0)
    return {
      ...row,
      value,
      x: padding.left + step * index,
      y: padding.top + chartHeight - (value / maximum) * chartHeight,
    }
  })
  const linePath = smoothPath(points)
  const areaPath = points.length
    ? `${linePath} L ${points.at(-1).x} ${baseline} L ${points[0].x} ${baseline} Z`
    : ''
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const latest = points.at(-1)?.value || 0
  const previous = points.at(-2)?.value || 0
  const difference = latest - previous

  if (!rows.length) return <div className="empty-box">Nessun andamento disponibile.</div>

  return (
    <div className="nova-wave-chart">
      <div className="nova-chart-kpis">
        <div><span>Nuovi nel periodo</span><strong>{total}</strong></div>
        <div><span>Ultimo mese</span><strong>{latest}</strong></div>
        <div className={difference >= 0 ? 'is-positive' : 'is-negative'}>
          <span>Variazione</span><strong>{difference > 0 ? '+' : ''}{difference}</strong>
        </div>
      </div>

      <div className="nova-wave-chart__canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Andamento ondulato dei nuovi tesserati negli ultimi sei mesi">
          <defs>
            <linearGradient id="novaWaveLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="52%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id="novaWaveArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c026d3" stopOpacity="0.32" />
              <stop offset="72%" stopColor="#8b5cf6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
            <filter id="novaWaveGlow" x="-20%" y="-30%" width="140%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + chartHeight * ratio
            const label = Math.round(maximum * (1 - ratio))
            return (
              <g key={ratio} className="nova-wave-chart__grid">
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                <text x={padding.left - 12} y={y + 4}>{label}</text>
              </g>
            )
          })}

          <path className="nova-wave-chart__area" d={areaPath} fill="url(#novaWaveArea)" />
          <path className="nova-wave-chart__line" d={linePath} stroke="url(#novaWaveLine)" filter="url(#novaWaveGlow)" />

          {points.map((point) => (
            <g className="nova-wave-chart__point" key={point.key || point.label}>
              <circle cx={point.x} cy={point.y} r="10" className="nova-wave-chart__halo" />
              <circle cx={point.x} cy={point.y} r="5" className="nova-wave-chart__dot">
                <title>{point.label}: {point.value} nuovi tesserati</title>
              </circle>
              <text x={point.x} y={height - 20} className="nova-wave-chart__label">{point.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function DonutChart({ rows = [] }) {
  const items = rows
    .map((row, index) => ({
      ...row,
      value: Number(row.value || 0),
      color: chartColors[index % chartColors.length],
    }))
    .filter((row) => row.value > 0)
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const percentages = items.map((item) => total ? (item.value / total) * 100 : 0)
  const segments = items.map((item, index) => ({
    ...item,
    percentage: percentages[index],
    offset: percentages.slice(0, index).reduce((sum, value) => sum + value, 0),
  }))

  if (!segments.length) return <div className="empty-box">Nessuna distribuzione disponibile.</div>

  return (
    <div className="nova-donut-layout">
      <div className="nova-donut-chart">
        <svg viewBox="0 0 220 220" role="img" aria-label="Grafico a torta dello stato degli allievi">
          <circle className="nova-donut-chart__track" cx="110" cy="110" r="78" pathLength="100" />
          {segments.map((segment) => {
            const visiblePercentage = Math.max(segment.percentage - 1.2, 0.8)
            return (
              <circle
                key={segment.label}
                className="nova-donut-chart__segment"
                cx="110"
                cy="110"
                r="78"
                pathLength="100"
                stroke={segment.color}
                strokeDasharray={`${visiblePercentage} ${100 - visiblePercentage}`}
                strokeDashoffset={-segment.offset}
              >
                <title>{segment.label}: {segment.value} ({Math.round(segment.percentage)}%)</title>
              </circle>
            )
          })}
        </svg>
        <div className="nova-donut-chart__center"><strong>{total}</strong><span>allievi</span></div>
      </div>

      <div className="nova-donut-legend">
        {segments.map((segment) => (
          <div className="nova-donut-legend__row" key={segment.label}>
            <i style={{ background: segment.color }} />
            <div><strong>{segment.label}</strong><span>{Math.round(segment.percentage)}% del totale</span></div>
            <b>{segment.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
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

      <div className="dashboard-grid nova-dashboard-ops-grid nova-dashboard-charts-grid">
        <div className="page-card nova-chart-card nova-chart-card--wave">
          <div className="section-head">
            <div>
              <h3>Nuovi tesserati</h3>
              <p>Andamento fluido degli ultimi 6 mesi.</p>
            </div>
            <span className="nova-chart-badge">Trend</span>
          </div>
          <WaveAreaChart rows={registry.registrationsByMonth} />
        </div>

        <div className="page-card nova-chart-card nova-chart-card--donut">
          <div className="section-head">
            <div>
              <h3>Stato allievi</h3>
              <p>Distribuzione tra corsisti, tesserati e situazioni da controllare.</p>
            </div>
            <span className="nova-chart-badge nova-chart-badge--pink">Composizione</span>
          </div>
          <DonutChart rows={registry.statusDistribution} />
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
