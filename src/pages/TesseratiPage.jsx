import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import {
  fetchTesserati,
  createTesserato,
  updateTesserato,
  deleteTesserato,
} from '../api/tesserati'

const emptyForm = {
  nome: '',
  cognome: '',
  cod_fiscale: '',
  cellulare: '',
  indirizzo: '',
  citta: '',
  email: '',
  tipo: 'Tesserato',
  anno: '25/26',
  pagamento: '',
  note: '',
}

export default function TesseratiPage() {
  const { role, user } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [anno, setAnno] = useState('')
  const [tipo, setTipo] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['tesserati', search, anno, tipo],
    queryFn: () => fetchTesserati({ search, anno, tipo }),
  })

  const anniDisponibili = useMemo(() => {
    const set = new Set(data.map((row) => row.anno).filter(Boolean))
    return Array.from(set).sort((a, b) => String(b).localeCompare(String(a)))
  }, [data])

  const tipiDisponibili = useMemo(() => {
    const set = new Set(data.map((row) => row.tipo).filter(Boolean))
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))
  }, [data])

  const createMutation = useMutation({
    mutationFn: createTesserato,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tesserati'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTesserato(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tesserati'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTesserato,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tesserati'] })
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setIsOpen(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      nome: row.nome || '',
      cognome: row.cognome || '',
      cod_fiscale: row.cod_fiscale || '',
      cellulare: row.cellulare || '',
      indirizzo: row.indirizzo || '',
      citta: row.citta || '',
      email: row.email || '',
      tipo: row.tipo || 'Tesserato',
      anno: row.anno || '25/26',
      pagamento: row.pagamento || '',
      note: row.note || '',
    })
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function onChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()

    const payload = {
      ...form,
      user_id: editing?.user_id || user.id,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function handleDelete(row) {
    const ok = window.confirm(`Eliminare ${row.nome || ''} ${row.cognome || ''}?`)
    if (!ok) return
    deleteMutation.mutate(row.id)
  }

  return (
    <section className="page">
      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Tesserati</h2>
            <p>Archivio tesserati completo</p>
          </div>

          {isAdmin ? (
            <button className="topbar__button topbar__button--primary" onClick={openCreate}>
              Nuovo tesserato
            </button>
          ) : null}
        </div>

        <div className="toolbar">
          <input
            className="searchInput"
            type="text"
            placeholder="Cerca per nome, cognome, email, codice fiscale o cellulare"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select className="filterSelect" value={anno} onChange={(e) => setAnno(e.target.value)}>
            <option value="">Tutti gli anni</option>
            {anniDisponibili.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select className="filterSelect" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Tutti i tipi</option>
            {tipiDisponibili.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? <p>Caricamento tesserati...</p> : null}
        {error ? <p>Errore: {error.message}</p> : null}

        {!isLoading && !error ? (
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cognome</th>
                  <th>Tipo</th>
                  <th>Anno</th>
                  <th>Pagamento</th>
                  <th>Email</th>
                  <th>Cellulare</th>
                  <th>Cod. fiscale</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan="9">Nessun tesserato trovato.</td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.id}>
                      <td>{row.nome || '-'}</td>
                      <td>{row.cognome || '-'}</td>
                      <td>{row.tipo || '-'}</td>
                      <td>{row.anno || '-'}</td>
                      <td>{row.pagamento || '-'}</td>
                      <td>{row.email || '-'}</td>
                      <td>{row.cellulare || '-'}</td>
                      <td>{row.cod_fiscale || '-'}</td>
                      <td>
                        {isAdmin ? (
                          <div className="rowActions">
                            <button className="actionBtn" onClick={() => openEdit(row)}>
                              Modifica
                            </button>
                            <button
                              className="actionBtn actionBtn--danger"
                              onClick={() => handleDelete(row)}
                            >
                              Elimina
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="modalOverlay" onClick={closeModal}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>{editing ? 'Modifica tesserato' : 'Nuovo tesserato'}</h3>
                <p>Compila i dati principali del tesserato.</p>
              </div>
            </div>

            <form className="formGrid" onSubmit={handleSubmit}>
              <input name="nome" placeholder="Nome" value={form.nome} onChange={onChange} required />
              <input
                name="cognome"
                placeholder="Cognome"
                value={form.cognome}
                onChange={onChange}
                required
              />
              <input
                name="cod_fiscale"
                placeholder="Codice fiscale"
                value={form.cod_fiscale}
                onChange={onChange}
              />
              <input
                name="cellulare"
                placeholder="Cellulare"
                value={form.cellulare}
                onChange={onChange}
              />
              <input
                name="indirizzo"
                placeholder="Indirizzo"
                value={form.indirizzo}
                onChange={onChange}
              />
              <input name="citta" placeholder="Città" value={form.citta} onChange={onChange} />
              <input name="email" placeholder="Email" value={form.email} onChange={onChange} />
              <input name="tipo" placeholder="Tipo" value={form.tipo} onChange={onChange} />
              <input name="anno" placeholder="Anno" value={form.anno} onChange={onChange} />
              <input
                name="pagamento"
                placeholder="Pagamento"
                value={form.pagamento}
                onChange={onChange}
              />
              <textarea
                className="formTextarea"
                name="note"
                placeholder="Note"
                value={form.note}
                onChange={onChange}
              />

              <div className="modalActions">
                <button type="button" className="topbar__button" onClick={closeModal}>
                  Annulla
                </button>
                <button
                  type="submit"
                  className="topbar__button topbar__button--primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? 'Salva modifiche' : 'Crea tesserato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}