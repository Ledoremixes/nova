import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  Gift,
  Package,
  Pencil,
  Plus,
  Search,
  Shirt,
  ShoppingBag,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import useNovaModules from '../hooks/useNovaModules'
import { createId, formatCurrency, formatItalianDate } from '../lib/novaModulesStore'
import { ModuleEmpty, ModuleHero, ModuleMetric, ModuleModal } from '../components/ui/ModuleKit'

const emptyProduct = {
  name: '',
  sku: '',
  category: 'Abbigliamento',
  price: 0,
  stock: 0,
  lowStock: 5,
  status: 'Attivo',
  color: '',
}

const categories = ['Abbigliamento', 'Accessori', 'Gift card', 'Altro']
const orderStatuses = ['Da preparare', 'Pronto', 'Consegnato', 'Annullato']

function ProductIcon({ category }) {
  if (category === 'Abbigliamento') return <Shirt size={30} />
  if (category === 'Gift card') return <Gift size={30} />
  return <Package size={30} />
}

export default function ShopPage() {
  const { data, commit } = useNovaModules()
  const [tab, setTab] = useState('catalogo')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tutte')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyProduct)

  const products = useMemo(() => data.products
    .filter((item) => category === 'Tutte' || item.category === category)
    .filter((item) => `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [category, data.products, search])

  const deliveredRevenue = data.orders.filter((order) => order.status === 'Consegnato').reduce((sum, order) => sum + Number(order.total || 0), 0)
  const pendingOrders = data.orders.filter((order) => ['Da preparare', 'Pronto'].includes(order.status)).length
  const lowStock = data.products.filter((product) => product.lowStock > 0 && product.stock <= product.lowStock).length
  const stockUnits = data.products.filter((product) => product.stock < 900).reduce((sum, product) => sum + Number(product.stock || 0), 0)

  function newProduct() {
    setEditingId(null)
    setForm(emptyProduct)
    setOpen(true)
  }

  function editProduct(product) {
    setEditingId(product.id)
    setForm({ ...product })
    setOpen(true)
  }

  function submit(event) {
    event.preventDefault()
    const normalized = { ...form, price: Number(form.price || 0), stock: Number(form.stock || 0), lowStock: Number(form.lowStock || 0) }
    if (editingId) {
      commit(
        (current) => ({ ...current, products: current.products.map((item) => item.id === editingId ? { ...normalized, id: editingId } : item) }),
        { action: 'Prodotto aggiornato', module: 'Shop', detail: `${normalized.name} · giacenza ${normalized.stock}`, severity: 'Successo' }
      )
    } else {
      const product = { ...normalized, id: createId('prd') }
      commit(
        (current) => ({ ...current, products: [...current.products, product] }),
        { action: 'Prodotto creato', module: 'Shop', detail: `${product.name} · ${product.sku}`, severity: 'Successo' }
      )
    }
    setOpen(false)
  }

  function removeProduct(product) {
    if (!window.confirm(`Eliminare “${product.name}” dal catalogo?`)) return
    commit(
      (current) => ({ ...current, products: current.products.filter((item) => item.id !== product.id) }),
      { action: 'Prodotto eliminato', module: 'Shop', detail: product.name, severity: 'Attenzione' }
    )
  }

  function updateOrderStatus(order, nextStatus) {
    commit(
      (current) => ({ ...current, orders: current.orders.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item) }),
      { action: 'Ordine aggiornato', module: 'Shop', detail: `${order.id} impostato come ${nextStatus}`, severity: nextStatus === 'Annullato' ? 'Attenzione' : 'Successo' }
    )
  }

  return (
    <section className="page module-page">
      <ModuleHero
        eyebrow="Catalogo e magazzino"
        title="Shop"
        description="Gestisci prodotti, disponibilità e ordini della scuola da un’unica area ordinata."
        icon={ShoppingBag}
      >
        <button className="module-button module-button--primary" type="button" onClick={newProduct}><Plus size={17} /> Nuovo prodotto</button>
      </ModuleHero>

      <div className="module-metrics-grid">
        <ModuleMetric label="Ricavi consegnati" value={formatCurrency(deliveredRevenue)} caption="Ordini completati" icon={TrendingUp} tone="green" />
        <ModuleMetric label="Ordini da gestire" value={pendingOrders} caption="In preparazione o pronti" icon={ShoppingBag} tone="blue" />
        <ModuleMetric label="Scorte basse" value={lowStock} caption="Prodotti sotto soglia" icon={AlertTriangle} tone="amber" />
        <ModuleMetric label="Pezzi a magazzino" value={stockUnits} caption="Escluse gift card digitali" icon={Boxes} />
      </div>

      <div className="page-card module-card">
        <div className="module-tabs">
          <button type="button" className={tab === 'catalogo' ? 'is-active' : ''} onClick={() => setTab('catalogo')}><Package size={17} /> Catalogo <span>{data.products.length}</span></button>
          <button type="button" className={tab === 'ordini' ? 'is-active' : ''} onClick={() => setTab('ordini')}><ShoppingBag size={17} /> Ordini <span>{data.orders.length}</span></button>
        </div>

        {tab === 'catalogo' ? <>
          <div className="module-toolbar">
            <label className="module-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome, SKU o categoria…" /></label>
            <select className="module-select" value={category} onChange={(event) => setCategory(event.target.value)}><option>Tutte</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          {products.length ? <div className="shop-grid">
            {products.map((product) => {
              const isLow = product.lowStock > 0 && product.stock <= product.lowStock
              return <article className="product-card" key={product.id}>
                <div className="product-card__visual"><ProductIcon category={product.category} /><span>{product.category}</span></div>
                <div className="product-card__body">
                  <div className="product-card__head"><span className={`module-badge ${product.status === 'Attivo' ? 'is-success' : 'is-neutral'}`}>{product.status}</span><small>{product.sku}</small></div>
                  <h3>{product.name}</h3><p>{product.color || 'Variante standard'}</p>
                  <div className="product-card__price">{formatCurrency(product.price)}</div>
                  <div className={`stock-indicator ${isLow ? 'is-low' : ''}`}><span><Archive size={16} /> Giacenza</span><strong>{product.stock > 900 ? 'Illimitata' : `${product.stock} pz`}</strong></div>
                  {isLow ? <div className="stock-warning"><AlertTriangle size={15} /> Riordino consigliato</div> : null}
                  <div className="product-card__actions"><button className="module-button module-button--soft" type="button" onClick={() => editProduct(product)}><Pencil size={15} /> Modifica</button><button className="module-icon-button is-danger" type="button" onClick={() => removeProduct(product)} aria-label="Elimina"><Trash2 size={16} /></button></div>
                </div>
              </article>
            })}
          </div> : <ModuleEmpty icon={Package} title="Nessun prodotto trovato" text="Modifica i filtri oppure aggiungi un nuovo articolo." />}
        </> : <div className="module-table-wrap">
          <table className="module-table">
            <thead><tr><th>Ordine</th><th>Cliente</th><th>Data</th><th>Articoli</th><th>Totale</th><th>Stato</th></tr></thead>
            <tbody>{data.orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{formatItalianDate(order.date)}</td><td>{order.items}</td><td><strong>{formatCurrency(order.total)}</strong></td><td><select className={`module-status-select is-${order.status.toLowerCase().replaceAll(' ', '-')}`} value={order.status} onChange={(event) => updateOrderStatus(order, event.target.value)}>{orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></td></tr>)}</tbody>
          </table>
          {!data.orders.length ? <ModuleEmpty icon={CheckCircle2} title="Nessun ordine" text="I nuovi ordini compariranno qui." /> : null}
        </div>}
      </div>

      <ModuleModal open={open} onClose={() => setOpen(false)} title={editingId ? 'Modifica prodotto' : 'Nuovo prodotto'} subtitle="Aggiorna catalogo, prezzo e disponibilità." icon={Package}>
        <form className="module-form" onSubmit={submit}>
          <label className="module-field module-field--full">Nome prodotto<span>*</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Es. T-shirt Orchidea" /></label>
          <label className="module-field">SKU<span>*</span><input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="ORC-000" /></label>
          <label className="module-field">Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="module-field">Prezzo (€)<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
          <label className="module-field">Giacenza<input type="number" min="0" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
          <label className="module-field">Soglia scorta<input type="number" min="0" value={form.lowStock} onChange={(event) => setForm({ ...form, lowStock: event.target.value })} /></label>
          <label className="module-field">Stato<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Attivo</option><option>Non attivo</option></select></label>
          <label className="module-field module-field--full">Variante / colore<input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} placeholder="Es. Nero" /></label>
          <div className="module-form__actions"><button type="button" className="module-button" onClick={() => setOpen(false)}>Annulla</button><button className="module-button module-button--primary">{editingId ? 'Salva modifiche' : 'Aggiungi prodotto'}</button></div>
        </form>
      </ModuleModal>
    </section>
  )
}
