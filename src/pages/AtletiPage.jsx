import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { fetchOrchideaStudents, updateTesserato } from '../api/orchideaEntities'
import '../styles/AtletiPage.css'

function fullName(row) {
  return row.nomeCompleto || `${row.nome || ''} ${row.cognome || ''}`.trim() || 'Senza nome'
}

function initials(row) {
  return fullName(row).split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

export default function AtletiPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [onlyCorsisti, setOnlyCorsisti] = useState(true)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')

  const studentsQuery = useQuery({
    queryKey: ['orchidea-atleti-corsisti'],
    queryFn: () => fetchOrchideaStudents({ onlyCorsisti: false }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateTesserato(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchidea-atleti-corsisti'] })
      queryClient.invalidateQueries({ queryKey: ['tesseramenti-orchidea'] })
      setSelected(null)
    },
  })

  const rows = studentsQuery.data || []
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyCorsisti && !row.is_corsista) return false
      if (!term) return true
      return [fullName(row), row.email, row.telefono, row.cf, row.numero_tessera]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [rows, search, onlyCorsisti])

  function toggleCorsista(row) {
    if (!isAdmin) return
    updateMutation.mutate({
      id: row.id,
      payload: {
        ...row.raw,
        is_corsista: !row.is_corsista,
      },
    })
  }

  return (
    <section className="page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-hero__eyebrow">Atleti / corsisti</div>
          <h2 className="dashboard-hero__title">Archivio corsisti da Orchidea Allievi</h2>
          <p className="dashboard-hero__text">La ricerca pesca direttamente dal nuovo database tesserati del portale allievi.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="page-card tesserati-stat-card"><span>Totale anagrafiche</span><strong>{rows.length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Corsisti</span><strong>{rows.filter((r) => r.is_corsista).length}</strong></div>
        <div className="page-card tesserati-stat-card"><span>Visibili ora</span><strong>{filtered.length}</strong></div>
      </div>

      <div className="page-card">
        <div className="section-head">
          <div>
            <h2>Atleti</h2>
            <p>Cerca per nome, cognome, email, telefono, codice fiscale o tessera.</p>
          </div>
        </div>

        <div className="toolbar toolbar--wrap">
          <div className="searchWrapper">
            <Search size={18} />
            <input className="searchInput" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca atleta/corsista…" />
          </div>
          <label className="check-card inline-check"><input type="checkbox" checked={onlyCorsisti} onChange={(e) => setOnlyCorsisti(e.target.checked)} /> Mostra solo corsisti</label>
        </div>

        {studentsQuery.isLoading ? <p>Caricamento atleti…</p> : null}
        {studentsQuery.error ? <p className="form-error">Errore: {studentsQuery.error.message}</p> : null}

        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Atleta</th><th>Email</th><th>Telefono</th><th>Cod. fiscale</th><th>Tessera</th><th>Ruolo</th><th>Azioni</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="7">Nessun atleta trovato.</td></tr> : filtered.map((row) => (
                <tr key={row.id}>
                  <td><div className="tesserati-person-cell"><span className="tesserati-avatar">{initials(row)}</span><div><strong>{fullName(row)}</strong><small>{row.stagione || 'Stagione non indicata'}</small></div></div></td>
                  <td>{row.email || '—'}</td>
                  <td>{row.telefono || '—'}</td>
                  <td>{row.cf || '—'}</td>
                  <td>{row.numero_tessera || '—'}</td>
                  <td><span className={row.is_corsista ? 'nova-pill nova-pill--ok' : 'nova-pill nova-pill--neutral'}>{row.is_corsista ? 'Corsista' : 'Tesserato'}</span></td>
                  <td><div className="rowActions"><button className="actionBtn" onClick={() => setSelected(row)}>Scheda</button>{isAdmin ? <button className="actionBtn" onClick={() => toggleCorsista(row)}>{row.is_corsista ? 'Rimuovi corsista' : 'Rendi corsista'}</button> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div><h3>{fullName(selected)}</h3><p>Scheda rapida atleta/corsista</p></div>
              <button className="topbar__button" onClick={() => setSelected(null)}>Chiudi</button>
            </div>
            <div className="detailGrid">
              <div>
                <p><strong>Email:</strong> {selected.email || '—'}</p>
                <p><strong>Telefono:</strong> {selected.telefono || '—'}</p>
                <p><strong>Codice fiscale:</strong> {selected.cf || '—'}</p>
                <p><strong>Tessera:</strong> {selected.numero_tessera || '—'}</p>
                <p><strong>Ruolo:</strong> {selected.is_corsista ? 'Corsista' : 'Tesserato'}</p>
              </div>
              <div className="page-card tesserati-nested-card">
                <UserCheck size={28} />
                <h3>Collegato al portale allievi</h3>
                <p>Le modifiche al ruolo corsista vengono salvate nella tabella tesseramenti.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
