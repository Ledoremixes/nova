import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, Trash2, Users, X, UserPlus, UserMinus } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import {
    addAthleteToGroup,
    createGroup,
    deleteGroup,
    fetchAthletesForGroup,
    fetchAvailableAthletes,
    fetchGroups,
    removeAthleteFromGroup,
    updateGroup,
} from '../api/groups'
import '../styles/GruppiPage.css'

const EMPTY_FORM = {
    nome: '',
    disciplina: '',
    livello: '',
    insegnante: '',
    giorni: '',
    orario_inizio: '',
    orario_fine: '',
    capienza: '',
    sala: '',
    descrizione: '',
    colore: '#6d5dfc',
    attivo: true,
}

export default function GruppiPage() {
    const queryClient = useQueryClient()
    const { user } = useAuth()

    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editingGroup, setEditingGroup] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [errorMessage, setErrorMessage] = useState('')

    const [groupAthletesModal, setGroupAthletesModal] = useState(false)
    const [selectedGroup, setSelectedGroup] = useState(null)
    const [athleteSearch, setAthleteSearch] = useState('')
    const [selectedAthleteId, setSelectedAthleteId] = useState('')
    const [selectedAthlete, setSelectedAthlete] = useState(null)

    const { data: groups = [], isLoading } = useQuery({
        queryKey: ['groups', user?.id],
        queryFn: () => fetchGroups(user.id),
        enabled: !!user?.id,
    })

    const { data: athletes = [] } = useQuery({
        queryKey: ['available-athletes', user?.id],
        queryFn: () => fetchAvailableAthletes(user.id),
        enabled: !!user?.id,
    })

    const { data: groupAthletes = [] } = useQuery({
        queryKey: ['group-athletes', user?.id, selectedGroup?.id],
        queryFn: () => fetchAthletesForGroup(user.id, selectedGroup.id),
        enabled: !!user?.id && !!selectedGroup?.id && groupAthletesModal,
    })

    const filteredGroups = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return groups

        return groups.filter((group) =>
            [
                group.nome,
                group.disciplina,
                group.livello,
                group.insegnante,
                group.giorni,
                group.sala,
            ]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(term))
        )
    }, [groups, search])

    const availableToAdd = useMemo(() => {
        const linkedIds = new Set(groupAthletes.map((item) => item.tesserato_id))
        const term = athleteSearch.trim().toLowerCase()

        return athletes.filter((athlete) => {
            if (linkedIds.has(athlete.id)) return false

            if (!term) return true

            return [
                athlete.nome,
                athlete.cognome,
                athlete.cod_fiscale,
                athlete.email,
                athlete.cellulare,
            ]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(term))
        })
    }, [athletes, groupAthletes, athleteSearch])

    useEffect(() => {
        if (!selectedAthlete) return

        const stillExists = availableToAdd.some((athlete) => athlete.id === selectedAthlete.id)

        if (!stillExists) {
            setSelectedAthlete(null)
        }
    }, [availableToAdd, selectedAthlete])

    useEffect(() => {
        if (!athleteSearch.trim()) {
            return
        }

        if (availableToAdd.length === 1) {
            setSelectedAthleteId(availableToAdd[0].id)
            return
        }

        if (!availableToAdd.some((athlete) => athlete.id === selectedAthleteId)) {
            setSelectedAthleteId('')
        }
    }, [athleteSearch, availableToAdd, selectedAthleteId])

    const createMutation = useMutation({
        mutationFn: createGroup,
        onSuccess: () => {
            setErrorMessage('')
            queryClient.invalidateQueries({ queryKey: ['groups', user?.id] })
            closeModal()
        },
        onError: (error) => {
            setErrorMessage(error.message || 'Errore nella creazione del gruppo')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => updateGroup(id, payload),
        onSuccess: () => {
            setErrorMessage('')
            queryClient.invalidateQueries({ queryKey: ['groups', user?.id] })
            closeModal()
        },
        onError: (error) => {
            setErrorMessage(error.message || 'Errore nella modifica del gruppo')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteGroup,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groups', user?.id] })
        },
        onError: (error) => {
            alert(error.message || 'Errore nell’eliminazione del gruppo')
        },
    })

    const addAthleteMutation = useMutation({
        mutationFn: addAthleteToGroup,
        onSuccess: () => {
            setSelectedAthleteId('')
            setSelectedAthlete(null)
            setAthleteSearch('')
            queryClient.invalidateQueries({ queryKey: ['group-athletes', user?.id, selectedGroup?.id] })
            queryClient.invalidateQueries({ queryKey: ['groups', user?.id] })
        },
        onError: (error) => {
            alert(error.message || 'Errore nell’aggiunta atleta al gruppo')
        },
    })

    const removeAthleteMutation = useMutation({
        mutationFn: removeAthleteFromGroup,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['group-athletes', user?.id, selectedGroup?.id] })
            queryClient.invalidateQueries({ queryKey: ['groups', user?.id] })
        },
        onError: (error) => {
            alert(error.message || 'Errore nella rimozione atleta dal gruppo')
        },
    })

    function openCreateModal() {
        setErrorMessage('')
        setEditingGroup(null)
        setForm(EMPTY_FORM)
        setShowModal(true)
    }

    function openEditModal(group) {
        setErrorMessage('')
        setEditingGroup(group)
        setForm({
            nome: group.nome ?? '',
            disciplina: group.disciplina ?? '',
            livello: group.livello ?? '',
            insegnante: group.insegnante ?? '',
            giorni: group.giorni ?? '',
            orario_inizio: group.orario_inizio ?? '',
            orario_fine: group.orario_fine ?? '',
            capienza: group.capienza ?? '',
            sala: group.sala ?? '',
            descrizione: group.descrizione ?? '',
            colore: group.colore ?? '#6d5dfc',
            attivo: group.attivo ?? true,
        })
        setShowModal(true)
    }

    function closeModal() {
        setShowModal(false)
        setEditingGroup(null)
        setForm(EMPTY_FORM)
        setErrorMessage('')
    }

    function openAthletesModal(group) {
        setSelectedGroup(group)
        setSelectedAthleteId('')
        setSelectedAthlete(null)
        setAthleteSearch('')
        setGroupAthletesModal(true)
    }

    function closeAthletesModal() {
        setGroupAthletesModal(false)
        setSelectedGroup(null)
        setSelectedAthleteId('')
        setSelectedAthlete(null)
        setAthleteSearch('')
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
        setErrorMessage('')

        if (!user?.id) {
            setErrorMessage('Utente non autenticato.')
            return
        }

        const payload = {
            user_id: user.id,
            nome: form.nome.trim(),
            disciplina: form.disciplina.trim() || null,
            livello: form.livello.trim() || null,
            insegnante: form.insegnante.trim() || null,
            giorni: form.giorni.trim() || null,
            orario_inizio: form.orario_inizio || null,
            orario_fine: form.orario_fine || null,
            capienza: form.capienza === '' ? 0 : Number(form.capienza),
            sala: form.sala.trim() || null,
            descrizione: form.descrizione.trim() || null,
            colore: form.colore || '#6d5dfc',
            attivo: !!form.attivo,
        }

        if (!payload.nome) {
            setErrorMessage('Inserisci il nome del gruppo.')
            return
        }

        if (editingGroup) {
            updateMutation.mutate({ id: editingGroup.id, payload })
        } else {
            createMutation.mutate(payload)
        }
    }

    function handleDelete(group) {
        const confirmDelete = window.confirm(`Vuoi eliminare il gruppo "${group.nome}"?`)
        if (!confirmDelete) return
        deleteMutation.mutate(group.id)
    }

    function handleAddAthlete() {
        if (!selectedGroup?.id || !selectedAthlete?.id || !user?.id) return

        addAthleteMutation.mutate({
            user_id: user.id,
            gruppo_id: selectedGroup.id,
            tesserato_id: selectedAthlete.id,
        })
    }

    function handleRemoveAthlete(linkId, athleteName) {
        const ok = window.confirm(`Vuoi rimuovere ${athleteName} da questo gruppo?`)
        if (!ok) return
        removeAthleteMutation.mutate(linkId)
    }

    return (
        <div className="gruppi-page">
            <div className="gruppi-header">
                <div>
                    <h1>Gruppi</h1>
                    <p>Gestisci corsi, livelli, orari e iscritti della scuola.</p>
                </div>

                <button className="gruppi-add-btn" onClick={openCreateModal}>
                    <Plus size={18} />
                    Nuovo gruppo
                </button>
            </div>

            <div className="gruppi-toolbar">
                <div className="gruppi-search">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Cerca gruppo, disciplina, insegnante..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="gruppi-summary">
                    <div className="gruppi-summary-card">
                        <span>Totale gruppi</span>
                        <strong>{groups.length}</strong>
                    </div>
                    <div className="gruppi-summary-card">
                        <span>Attivi</span>
                        <strong>{groups.filter((g) => g.attivo).length}</strong>
                    </div>
                    <div className="gruppi-summary-card">
                        <span>Iscrizioni</span>
                        <strong>
                            {groups.reduce((sum, group) => sum + (group.atleti_gruppi?.length || 0), 0)}
                        </strong>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="gruppi-empty">Caricamento gruppi...</div>
            ) : filteredGroups.length === 0 ? (
                <div className="gruppi-empty">Nessun gruppo trovato.</div>
            ) : (
                <div className="gruppi-grid">
                    {filteredGroups.map((group) => {
                        const iscritti = group.atleti_gruppi?.length || 0

                        return (
                            <div className="gruppo-card" key={group.id}>
                                <div className="gruppo-card-top">
                                    <div className="gruppo-color" style={{ background: group.colore || '#6d5dfc' }} />
                                    <div className="gruppo-title-wrap">
                                        <h3>{group.nome}</h3>
                                        <span className={`gruppo-status ${group.attivo ? 'active' : 'inactive'}`}>
                                            {group.attivo ? 'Attivo' : 'Disattivo'}
                                        </span>
                                    </div>
                                </div>

                                <div className="gruppo-meta">
                                    <span><strong>Disciplina:</strong> {group.disciplina || '-'}</span>
                                    <span><strong>Livello:</strong> {group.livello || '-'}</span>
                                    <span><strong>Insegnante:</strong> {group.insegnante || '-'}</span>
                                    <span><strong>Giorni:</strong> {group.giorni || '-'}</span>
                                    <span>
                                        <strong>Orario:</strong>{' '}
                                        {group.orario_inizio && group.orario_fine
                                            ? `${group.orario_inizio.slice(0, 5)} - ${group.orario_fine.slice(0, 5)}`
                                            : '-'}
                                    </span>
                                    <span><strong>Sala:</strong> {group.sala || '-'}</span>
                                    <span><strong>Capienza:</strong> {group.capienza ?? 0}</span>
                                    <span><strong>Iscritti:</strong> {iscritti}</span>
                                </div>

                                {group.descrizione && <p className="gruppo-description">{group.descrizione}</p>}

                                <div className="gruppo-actions">
                                    <button className="manage" onClick={() => openAthletesModal(group)}>
                                        <Users size={16} />
                                        Gestisci atleti
                                    </button>
                                    <button className="edit" onClick={() => openEditModal(group)}>
                                        <Pencil size={16} />
                                        Modifica
                                    </button>
                                    <button className="delete" onClick={() => handleDelete(group)}>
                                        <Trash2 size={16} />
                                        Elimina
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {showModal && (
                <div className="gruppi-modal-overlay" onClick={closeModal}>
                    <div className="gruppi-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="gruppi-modal-header">
                            <h2>{editingGroup ? 'Modifica gruppo' : 'Nuovo gruppo'}</h2>
                            <button className="close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>

                        <form className="gruppi-form" onSubmit={handleSubmit}>
                            <div className="form-grid">
                                <label>
                                    <span>Nome gruppo</span>
                                    <input type="text" name="nome" value={form.nome} onChange={handleChange} required />
                                </label>

                                <label>
                                    <span>Disciplina</span>
                                    <input
                                        type="text"
                                        name="disciplina"
                                        value={form.disciplina}
                                        onChange={handleChange}
                                        placeholder="Es. Salsa, Bachata"
                                    />
                                </label>

                                <label>
                                    <span>Livello</span>
                                    <input
                                        type="text"
                                        name="livello"
                                        value={form.livello}
                                        onChange={handleChange}
                                        placeholder="Es. Base, Intermedio"
                                    />
                                </label>

                                <label>
                                    <span>Insegnante</span>
                                    <input type="text" name="insegnante" value={form.insegnante} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Giorni</span>
                                    <input type="text" name="giorni" value={form.giorni} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Ora inizio</span>
                                    <input type="time" name="orario_inizio" value={form.orario_inizio} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Ora fine</span>
                                    <input type="time" name="orario_fine" value={form.orario_fine} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Capienza</span>
                                    <input type="number" min="0" name="capienza" value={form.capienza} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Sala</span>
                                    <input type="text" name="sala" value={form.sala} onChange={handleChange} />
                                </label>

                                <label>
                                    <span>Colore</span>
                                    <input type="color" name="colore" value={form.colore} onChange={handleChange} />
                                </label>

                                <label className="checkbox-field">
                                    <input type="checkbox" name="attivo" checked={form.attivo} onChange={handleChange} />
                                    <span>Gruppo attivo</span>
                                </label>
                            </div>

                            <label className="full-width">
                                <span>Descrizione</span>
                                <textarea name="descrizione" rows="4" value={form.descrizione} onChange={handleChange} />
                            </label>

                            {errorMessage && <div className="gruppi-form-error">{errorMessage}</div>}

                            <div className="gruppi-form-actions">
                                <button type="button" className="secondary" onClick={closeModal}>
                                    Annulla
                                </button>
                                <button type="submit" className="primary">
                                    {editingGroup ? 'Salva modifiche' : 'Crea gruppo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {groupAthletesModal && selectedGroup && (
                <div className="gruppi-modal-overlay" onClick={closeAthletesModal}>
                    <div className="gruppi-modal large" onClick={(e) => e.stopPropagation()}>
                        <div className="gruppi-modal-header">
                            <div>
                                <h2>Gestisci atleti</h2>
                                <p className="modal-subtitle">{selectedGroup.nome}</p>
                            </div>
                            <button className="close-btn" onClick={closeAthletesModal}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="group-athletes-layout">
                            <div className="group-athletes-box">
                                <h3>Aggiungi atleta</h3>

                                <div className="gruppi-search small">
                                    <Search size={18} />
                                    <input
                                        type="text"
                                        placeholder="Cerca atleta..."
                                        value={athleteSearch}
                                        onChange={(e) => setAthleteSearch(e.target.value)}
                                    />
                                </div>

                                <div className="athlete-results">
                                    {!athleteSearch.trim() ? (
                                        <div className="athlete-results-empty">
                                            Inizia a scrivere per cercare un atleta.
                                        </div>
                                    ) : availableToAdd.length === 0 ? (
                                        <div className="athlete-results-empty">
                                            Nessun atleta trovato.
                                        </div>
                                    ) : (
                                        availableToAdd.map((athlete) => {
                                            const fullName = `${athlete.cognome || ''} ${athlete.nome || ''}`.trim()
                                            const secondary =
                                                athlete.cellulare || athlete.email || athlete.cod_fiscale || 'Nessun dettaglio'

                                            return (
                                                <button
                                                    key={athlete.id}
                                                    type="button"
                                                    className={`athlete-result-item ${selectedAthlete?.id === athlete.id ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedAthlete(athlete)
                                                        setSelectedAthleteId(athlete.id)
                                                    }}
                                                >
                                                    <div className="athlete-result-text">
                                                        <strong>{fullName || 'Atleta'}</strong>
                                                        <span>{secondary}</span>
                                                    </div>
                                                </button>
                                            )
                                        })
                                    )}
                                </div>

                                {selectedAthlete && (
                                    <div className="selected-athlete-box">
                                        <span>Selezionato</span>
                                        <strong>{`${selectedAthlete.cognome || ''} ${selectedAthlete.nome || ''}`.trim()}</strong>
                                    </div>
                                )}

                                <button
                                    className="add-athlete-btn"
                                    onClick={handleAddAthlete}
                                    disabled={!selectedAthlete || addAthleteMutation.isPending}
                                >
                                    <UserPlus size={16} />
                                    Aggiungi al gruppo
                                </button>

                            </div>

                            <div className="group-athletes-box">
                                <h3>Iscritti al gruppo</h3>

                                {groupAthletes.length === 0 ? (
                                    <div className="gruppi-empty compact">Nessun atleta associato.</div>
                                ) : (
                                    <div className="athletes-list">
                                        {groupAthletes.map((item) => {
                                            const athlete = item.tesserati
                                            const fullName = `${athlete?.cognome || ''} ${athlete?.nome || ''}`.trim()

                                            return (
                                                <div className="athlete-row" key={item.id}>
                                                    <div>
                                                        <strong>{fullName || 'Atleta'}</strong>
                                                        <span>
                                                            {athlete?.cellulare || athlete?.email || athlete?.cod_fiscale || 'Nessun dettaglio'}
                                                        </span>
                                                    </div>

                                                    <button
                                                        className="remove-athlete-btn"
                                                        onClick={() => handleRemoveAthlete(item.id, fullName)}
                                                    >
                                                        <UserMinus size={16} />
                                                        Rimuovi
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}