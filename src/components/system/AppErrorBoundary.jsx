import { Component } from 'react'
import '../../styles/errorBoundary.css'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, code: null }
  }

  static getDerivedStateFromError(error) {
    const code = `UI-${Date.now().toString(36).toUpperCase()}`
    return { error, code }
  }

  componentDidCatch(error, info) {
    console.error('Nova UI error boundary:', { error, info, code: this.state.code })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="nova-fatal-shell" role="alert">
        <section className="nova-fatal-card">
          <div className="nova-fatal-mark">N</div>
          <span>Nova ha intercettato un errore dell’interfaccia</span>
          <h1>La schermata è stata protetta.</h1>
          <p>
            I dati non vengono modificati da questa schermata di sicurezza. Ricarica Nova e riprendi
            l’operazione. Se il problema si ripete, comunica il codice qui sotto all’amministratore.
          </p>
          <strong>{this.state.code}</strong>
          <div className="nova-fatal-actions">
            <button type="button" onClick={() => window.location.reload()}>Ricarica Nova</button>
            <button type="button" className="is-secondary" onClick={() => { window.location.href = '/dashboard' }}>Vai alla Dashboard</button>
          </div>
        </section>
      </main>
    )
  }
}
