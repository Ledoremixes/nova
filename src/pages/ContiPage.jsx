import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CirclePlus,
  Pencil,
  Trash2,
  X,
  Settings2,
  Search,
} from 'lucide-react'
import '../styles/ContiPage.css'
import {
  fetchLookupOptions,
  createLookupOption,
  updateLookupOption,
  deleteLookupOption,
} from '../api/lookups'

const LOOKUP_SECTIONS = [
  {
    sectionKey: 'sport',
    title: 'Sport e corsi',
    description: 'Gestione menu a tendina per corsi, livelli e tesseramenti.',
    lists: [
      { listKey: 'corsi', label: 'Corsi' },
      { listKey: 'livelli_corso', label: 'Livelli corso' },
      { listKey: 'tipi_tesseramento', label: 'Tipi tesseramento' },
    ],
  },
  {
    sectionKey: 'pagamenti',
    title: 'Pagamenti',
    description: 'Categorie e metodi usati nelle sezioni economiche.',
    lists: [
      { listKey: 'metodi_pagamento', label: 'Metodi pagamento' },
      { listKey: 'categorie_pagamento', label: 'Categorie pagamento' },
      { listKey: 'stati_pagamento', label: 'Stati pagamento' },
    ],
  },
  {
    sectionKey: 'fatture',
    title: 'Fatturazione',
    description: 'Tipologie documento e altri valori selezionabili.',
    lists: [
      { listKey: 'tipi_documento', label: 'Tipi documento' },
      { listKey: 'stati_fattura', label: 'Stati fattura' },
    ],
  },
  {
    sectionKey: 'utenti',
    title: 'Utenti e permessi',
    description: 'Ruoli e classificazioni interne.',
    lists: [
      { listKey: 'ruoli_utente', label: 'Ruoli utente' },
      { listKey: 'reparti', label: 'Reparti' },
    ],
  },
]

const emptyForm = {
  id: null,
  section_key: '',
  list_key: '',
  label: '',
  value: '',
  sort_order: 0,
  is_active: true,
}

function prettifyKey(value) {
  return value.replaceAll('_', ' ')
}

export default function ContiPage() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedSection, setSelectedSection] = useState('sport')
  const [form, setForm] = useState(emptyForm)

  const lookupsQuery = useQuery({
    queryKey: ['lookup-options'],
    queryFn: fetchLookupOptions,
  })

  const createMutation = useMutation({
    mutationFn: createLookupOption,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-options'] })
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateLookupOption(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-options'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLookupOption,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lookup-options'] })
    },
  })

  const allItems = lookupsQuery.data ?? []

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()

    return allItems.filter((item) => {
      const inSection = item.section_key === selectedSection
      if (!inSection) return false
      if (!term) return true

      return [item.label, item.value, item.list_key]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [allItems, search, selectedSection])

  const groupedLists = useMemo(() => {
    const currentSection = LOOKUP_SECTIONS.find(
      (section) => section.sectionKey === selectedSection
    )

    if (!currentSection) return []

    return currentSection.lists.map((list) => ({
      ...list,
      items: filteredItems.filter((item) => item.list_key === list.listKey),
    }))
  }, [filteredItems, selectedSection])

  function handleOpenCreate(sectionKey, listKey) {
    setEditingItem(null)
    setForm({
      ...emptyForm,
      section_key: sectionKey,
      list_key: listKey,
      sort_order: 0,
      is_active: true,
    })
    setModalOpen(true)
  }

  function handleOpenEdit(item) {
    setEditingItem(item)
    setForm({
      id: item.id,
      section_key: item.section_key,
      list_key: item.list_key,
      label: item.label ?? '',
      value: item.value ?? '',
      sort_order: item.sort_order ?? 0,
      is_active: item.is_active ?? true,
    })
    setModalOpen(true)
  }

  function handleCloseModal() {
    setModalOpen(false)
    setEditingItem(null)
    setForm(emptyForm)
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!form.section_key || !form.list_key || !form.label.trim()) {
      alert('Compila sezione, lista ed etichetta.')
      return
    }

    const payload = {
      section_key: form.section_key,
      list_key: form.list_key,
      label: form.label,
      value: form.value,
      sort_order: Number(form.sort_order || 0),
      is_active: form.is_active,
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload })
      return
    }

    createMutation.mutate(payload)
  }

  function handleDelete(item) {
    const ok = window.confirm(`Vuoi eliminare "${item.label}"?`)
    if (!ok) return
    deleteMutation.mutate(item.id)
  }

  return (
    <div className="conti-page">
      <section className="conti-hero card-surface">
        <div>
          <p className="eyebrow">Configurazioni</p>
          <h1>Conti</h1>
          <p className="hero-subtitle">
            Gestisci da qui tutti i valori dei menu a tendina del gestionale, divisi per sezione.
          </p>
        </div>
      </section>

      <section className="conti-section-tabs">
        {LOOKUP_SECTIONS.map((section) => (
          <button
            key={section.sectionKey}
            className={`section-tab ${selectedSection === section.sectionKey ? 'active' : ''}`}
            onClick={() => setSelectedSection(section.sectionKey)}
          >
            <Settings2 size={16} />
            {section.title}
          </button>
        ))}
      </section>

      <section className="card-surface conti-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            type="text"
            placeholder="Cerca voce, lista o valore..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      {groupedLists.map((list) => (
        <section key={list.listKey} className="card-surface lookup-block">
          <div className="lookup-block-header">
            <div>
              <h2>{list.label}</h2>
              <p>{prettifyKey(list.listKey)}</p>
            </div>

            <button
              className="primary-btn"
              onClick={() => handleOpenCreate(selectedSection, list.listKey)}
            >
              <CirclePlus size={18} />
              Nuova voce
            </button>
          </div>

          {list.items.length === 0 ? (
            <div className="empty-state">Nessuna voce configurata.</div>
          ) : (
            <div className="table-wrap">
              <table className="lookup-table">
                <thead>
                  <tr>
                    <th>Etichetta</th>
                    <th>Valore</th>
                    <th>Ordine</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.label}</td>
                      <td>{item.value || '—'}</td>
                      <td>{item.sort_order}</td>
                      <td>
                        <span className={`status-badge ${item.is_active ? 'success' : 'neutral'}`}>
                          {item.is_active ? 'Attiva' : 'Disattiva'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            onClick={() => handleOpenEdit(item)}
                            title="Modifica"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => handleDelete(item)}
                            title="Elimina"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {modalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-card conti-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingItem ? 'Modifica voce' : 'Nuova voce'}</h2>
                <p>Gestione valori per i menu a tendina del gestionale.</p>
              </div>

              <button className="icon-btn" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            <form className="conti-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  <span>Sezione</span>
                  <input value={form.section_key} disabled />
                </label>

                <label>
                  <span>Lista</span>
                  <input value={form.list_key} disabled />
                </label>

                <label>
                  <span>Etichetta</span>
                  <input
                    name="label"
                    value={form.label}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label>
                  <span>Valore tecnico</span>
                  <input
                    name="value"
                    value={form.value}
                    onChange={handleChange}
                    placeholder="Facoltativo"
                  />
                </label>

                <label>
                  <span>Ordine</span>
                  <input
                    type="number"
                    name="sort_order"
                    value={form.sort_order}
                    onChange={handleChange}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={form.is_active}
                    onChange={handleChange}
                  />
                  <span>Voce attiva</span>
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={handleCloseModal}>
                  Annulla
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingItem ? 'Salva modifiche' : 'Crea voce'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}