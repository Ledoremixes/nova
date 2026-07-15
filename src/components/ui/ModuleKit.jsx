import { X } from 'lucide-react'

export function ModuleHero({ eyebrow, title, description, icon: Icon, children }) {
  return (
    <div className="module-hero">
      <div className="module-hero__content">
        <div className="dashboard-hero__eyebrow">{eyebrow}</div>
        <h2 className="dashboard-hero__title">{title}</h2>
        <p className="dashboard-hero__text">{description}</p>
        {children ? <div className="module-hero__actions">{children}</div> : null}
      </div>
      {Icon ? <div className="module-hero__icon"><Icon size={40} /></div> : null}
    </div>
  )
}

export function ModuleMetric({ label, value, caption, icon: Icon, tone = 'violet' }) {
  return (
    <div className={`module-metric module-metric--${tone}`}>
      <div className="module-metric__top">
        <span>{label}</span>
        {Icon ? <Icon size={19} /> : null}
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  )
}

export function ModuleModal({ open, title, subtitle, icon: Icon, onClose, children, size = 'medium' }) {
  if (!open) return null

  return (
    <div className="modalOverlay module-modal-overlay" onMouseDown={onClose}>
      <div className={`modalCard module-modal module-modal--${size}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="module-modal__header">
          <div className="module-modal__heading">
            {Icon ? <span><Icon size={21} /></span> : null}
            <div>
              <h3>{title}</h3>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <button className="module-icon-button" type="button" onClick={onClose} aria-label="Chiudi">
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ModuleEmpty({ icon: Icon, title, text }) {
  return (
    <div className="module-empty">
      {Icon ? <span><Icon size={24} /></span> : null}
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}
