import '../../styles/StatCard.css'

export default function StatCard({ title, value, hint, accent = false }) {
  return (
    <article className={`stat-card ${accent ? 'stat-card--accent' : ''}`}>
      <div className="stat-card__top">
        <span className="stat-card__title">{title}</span>
      </div>

      <div className="stat-card__value" title={String(value)}>
        {value}
      </div>

      {hint ? <div className="stat-card__hint">{hint}</div> : null}
    </article>
  )
}