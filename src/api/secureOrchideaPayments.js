import { supabase } from './supabase'

// Solo pagamenti: usa la sessione Nova per l'autorizzazione lato server.
// Mai esporre la chiave service_role nel browser o nella API client.
class PaymentQuery {
  constructor(operation = 'select', payload = undefined) {
    this.operation = operation
    this.payload = payload
    this.filters = []
    this.columns = '*'
    this.returning = false
    this.sort = null
    this.maxRows = null
    this.one = null
  }
  select(columns = '*') {
    this.columns = columns
    this.returning = true
    return this
  }
  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }
  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.operation = 'delete'
    return this
  }
  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }
  in(column, value) {
    this.filters.push({ op: 'in', column, value })
    return this
  }
  gte(column, value) {
    this.filters.push({ op: 'gte', column, value })
    return this
  }
  lte(column, value) {
    this.filters.push({ op: 'lte', column, value })
    return this
  }
  or(value) {
    this.filters.push({ op: 'or', value })
    return this
  }
  order(column, options = {}) {
    this.sort = { column, ascending: options.ascending !== false, nullsFirst: options.nullsFirst === true }
    return this
  }
  limit(value) {
    this.maxRows = value
    return this
  }
  single() {
    this.one = 'single'
    return this
  }
  maybeSingle() {
    this.one = 'maybeSingle'
    return this
  }
  async run() {
    try {
      const { data: sessionData, error: authError } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (authError || !token) throw new Error('Sessione Nova non disponibile. Effettua nuovamente il login.')
      const response = await fetch('/api/orchidea-payments-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        cache: 'no-store',
        body: JSON.stringify({
          operation: this.operation,
          payload: this.payload,
          filters: this.filters,
          columns: this.columns,
          returning: this.returning,
          order: this.sort,
          limit: this.maxRows,
          single: this.one,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) {
        return { data: null, error: { code: result.code || String(response.status), message: result.error || 'Errore operazione pagamenti.' } }
      }
      return { data: result.data, error: null }
    } catch (error) {
      return { data: null, error: { code: 'NOVA_PAYMENT_GATEWAY_UNAVAILABLE', message: error?.message || 'Servizio pagamenti non disponibile.' } }
    }
  }
  then(resolve, reject) {
    return this.run().then(resolve, reject)
  }
}

// Compatibilità con lo stile supabase.from('pagamenti') nella sezione Nova.
// Nessuna chiamata diretta alla tabella pagamenti nel client.
export function paymentTable() {
  return new PaymentQuery()
}
