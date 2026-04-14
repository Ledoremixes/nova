import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet } from 'lucide-react'
import {
    mapImportedAthleteRows,
    importAthletesRows,
} from '../api/atletiImport'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
    CirclePlus,
    Pencil,
    Search,
    Trash2,
    X,
    Users,
    HeartPulse,
    IdCard,
} from 'lucide-react'
import '../styles/AtletiPage.css'
import {
    fetchAtleti,
    fetchTesseratiForAthletes,
    createAtletaFromExistingTesserato,
    createAtletaWithNewTesserato,
    updateAtleta,
    deleteAtleta,
} from '../api/atleti'

import { fetchLookupList } from '../api/lookups'
import { fetchAtletaCorsi, replaceAtletaCorsi } from '../api/atletaCorsi'

const emptyForm = {
    tesserato_id: '',
    nome: '',
    cognome: '',
    data_nascita: '',
    cod_fiscale: '',
    cellulare: '',
    email: '',
    indirizzo: '',
    citta: '',
    numero_tessera: '',
    scadenza_tessera: '',
    certificato_medico_presente: false,
    scadenza_visita_medica: '',
    note: '',
    is_active: true,
}

function getMedicalStatus(date) {
    if (!date) return { label: 'Assente', tone: 'neutral' }

    const today = dayjs()
    const expiry = dayjs(date)
    const diff = expiry.diff(today, 'day')

    if (diff < 0) return { label: 'Scaduta', tone: 'danger' }
    if (diff <= 30) return { label: 'In scadenza', tone: 'warning' }
    return { label: 'Valida', tone: 'success' }
}

function getMembershipStatus(date, active) {
    if (!active) return { label: 'Inattivo', tone: 'neutral' }
    if (!date) return { label: 'Non impostata', tone: 'neutral' }

    const today = dayjs()
    const expiry = dayjs(date)
    const diff = expiry.diff(today, 'day')

    if (diff < 0) return { label: 'Scaduta', tone: 'danger' }
    if (diff <= 30) return { label: 'In scadenza', tone: 'warning' }
    return { label: 'Attiva', tone: 'success' }
}

export default function AtletiPage() {
    const queryClient = useQueryClient()

    const [search, setSearch] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [editingItem, setEditingItem] = useState(null)
    const [createMode, setCreateMode] = useState('existing')
    const [form, setForm] = useState(emptyForm)

    const [importModalOpen, setImportModalOpen] = useState(false)
    const [parsedImportRows, setParsedImportRows] = useState([])
    const [importFileName, setImportFileName] = useState('')
    const [importResult, setImportResult] = useState(null)

    const [courseAssignments, setCourseAssignments] = useState([
        { corso_lookup_id: '', livello_lookup_id: '', note: '' }
    ])

    const [isImporting, setIsImporting] = useState(false)
    const [importProgress, setImportProgress] = useState({
        current: 0,
        total: 0,
        percent: 0,
        rowNumber: null,
        status: '',
        message: '',
    })
    const [importToast, setImportToast] = useState(null)

    const atletiQuery = useQuery({
        queryKey: ['atleti'],
        queryFn: fetchAtleti,
    })

    const tesseratiQuery = useQuery({
        queryKey: ['tesserati-for-athletes'],
        queryFn: fetchTesseratiForAthletes,
    })

    const corsiQuery = useQuery({
        queryKey: ['lookup-options', 'sport', 'corsi'],
        queryFn: () => fetchLookupList('sport', 'corsi'),
    })

    const livelliQuery = useQuery({
        queryKey: ['lookup-options', 'sport', 'livelli_corso'],
        queryFn: () => fetchLookupList('sport', 'livelli_corso'),
    })

    const createMutation = useMutation({
        mutationFn: (payload) => {
            if (createMode === 'existing') {
                return createAtletaFromExistingTesserato(payload)
            }
            return createAtletaWithNewTesserato(payload)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['atleti'] })
            queryClient.invalidateQueries({ queryKey: ['tesserati-for-athletes'] })
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => updateAtleta(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['atleti'] })
            queryClient.invalidateQueries({ queryKey: ['tesserati-for-athletes'] })
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteAtleta,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['atleti'] })
            queryClient.invalidateQueries({ queryKey: ['tesserati-for-athletes'] })
        },
    })

    const replaceAtletaCorsiMutation = useMutation({
        mutationFn: ({ atletaId, rows }) => replaceAtletaCorsi(atletaId, rows),
    })

    const atleti = atletiQuery.data ?? []
    const tesserati = tesseratiQuery.data ?? []
    const corsi = corsiQuery.data ?? []
    const livelli = livelliQuery.data ?? []

    const usedTesseratoIds = new Set(
        atleti.map((item) => item.tesserato?.id).filter(Boolean)
    )

    const availableTesserati = tesserati.filter(
        (item) => !usedTesseratoIds.has(item.id)
    )

    const filteredAtleti = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return atleti

        return atleti.filter((item) => {
            const values = [
                item.tesserato?.nome,
                item.tesserato?.cognome,
                item.tesserato?.cellulare,
                item.tesserato?.email,
                item.tesserato?.cod_fiscale,
                item.numero_tessera,
                ...(item.corsi ?? []).flatMap((corsoItem) => [
                    corsoItem.corso?.label,
                    corsoItem.livello?.label,
                ]),
            ]

            return values.some((value) =>
                String(value ?? '').toLowerCase().includes(term)
            )
        })
    }, [atleti, search])

    function handleOpenCreate() {
        setEditingItem(null)
        setCreateMode('existing')
        setForm(emptyForm)
        resetCourseAssignments()
        setModalOpen(true)
    }

    async function handleOpenEdit(item) {
        try {
            const corsiAtleta = await fetchAtletaCorsi(item.id)

            setEditingItem(item)
            setForm({
                tesserato_id: item.tesserato?.id ?? '',
                nome: item.tesserato?.nome ?? '',
                cognome: item.tesserato?.cognome ?? '',
                data_nascita: item.tesserato?.data_nascita ?? '',
                cod_fiscale: item.tesserato?.cod_fiscale ?? '',
                cellulare: item.tesserato?.cellulare ?? '',
                email: item.tesserato?.email ?? '',
                indirizzo: item.tesserato?.indirizzo ?? '',
                citta: item.tesserato?.citta ?? '',
                numero_tessera: item.numero_tessera ?? '',
                scadenza_tessera: item.scadenza_tessera ?? '',
                certificato_medico_presente: !!item.certificato_medico_presente,
                scadenza_visita_medica: item.scadenza_visita_medica ?? '',
                note: item.note ?? '',
                is_active: item.is_active ?? true,
            })

            setCourseAssignments(
                corsiAtleta.length
                    ? corsiAtleta.map((row) => ({
                        corso_lookup_id: row.corso_lookup_id ?? '',
                        livello_lookup_id: row.livello_lookup_id ?? '',
                        note: row.note ?? '',
                    }))
                    : [{ corso_lookup_id: '', livello_lookup_id: '', note: '' }]
            )

            setModalOpen(true)
        } catch (error) {
            alert(error.message || 'Errore nel caricamento dei corsi atleta.')
        }
    }

    function handleCloseModal() {
        if (replaceAtletaCorsiMutation.isPending) return

        setModalOpen(false)
        setEditingItem(null)
        setCreateMode('existing')
        setForm(emptyForm)
        resetCourseAssignments()
    }

    function handleChange(event) {
        const { name, value, type, checked } = event.target
        setForm((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        try {
            let atletaId = editingItem?.id ?? null

            if (editingItem) {
                const updated = await updateMutation.mutateAsync({
                    id: editingItem.id,
                    payload: {
                        ...form,
                        tesserato_id: form.tesserato_id,
                    },
                })

                atletaId = updated.id
            } else if (createMode === 'existing') {
                if (!form.tesserato_id) {
                    alert('Seleziona un tesserato.')
                    return
                }

                const created = await createMutation.mutateAsync({
                    tesserato_id: form.tesserato_id,
                    numero_tessera: form.numero_tessera,
                    scadenza_tessera: form.scadenza_tessera || null,
                    certificato_medico_presente: form.certificato_medico_presente,
                    scadenza_visita_medica: form.scadenza_visita_medica || null,
                    note: form.note,
                    is_active: form.is_active,
                })

                atletaId = created.id
            } else {
                if (!form.nome.trim() || !form.cognome.trim()) {
                    alert('Inserisci nome e cognome.')
                    return
                }

                const created = await createMutation.mutateAsync({
                    ...form,
                })

                atletaId = created.id
            }

            await replaceAtletaCorsiMutation.mutateAsync({
                atletaId,
                rows: courseAssignments,
            })

            queryClient.invalidateQueries({ queryKey: ['atleti'] })
            handleCloseModal()
        } catch (error) {
            alert(error.message || 'Errore durante il salvataggio dell’atleta.')
        }
    }

    function handleDelete(item) {
        const ok = window.confirm(
            `Vuoi eliminare ${item.tesserato?.nome ?? ''} ${item.tesserato?.cognome ?? ''}?`
        )
        if (!ok) return
        deleteMutation.mutate(item.id)
    }

    function handleOpenImportModal() {
        setImportModalOpen(true)
        setParsedImportRows([])
        setImportFileName('')
        setImportResult(null)
        setIsImporting(false)
        setImportProgress({
            current: 0,
            total: 0,
            percent: 0,
            rowNumber: null,
            status: '',
            message: '',
        })
    }

    function handleCloseImportModal() {
        if (isImporting) return

        setImportModalOpen(false)
        setParsedImportRows([])
        setImportFileName('')
        setImportResult(null)
        setIsImporting(false)
        setImportProgress({
            current: 0,
            total: 0,
            percent: 0,
            rowNumber: null,
            status: '',
            message: '',
        })
    }

    function resetCourseAssignments() {
        setCourseAssignments([{ corso_lookup_id: '', livello_lookup_id: '', note: '' }])
    }

    function addCourseAssignment() {
        setCourseAssignments((prev) => [
            ...prev,
            { corso_lookup_id: '', livello_lookup_id: '', note: '' },
        ])
    }

    function removeCourseAssignment(index) {
        setCourseAssignments((prev) => {
            const next = prev.filter((_, i) => i !== index)
            return next.length
                ? next
                : [{ corso_lookup_id: '', livello_lookup_id: '', note: '' }]
        })
    }

    function updateCourseAssignment(index, field, value) {
        setCourseAssignments((prev) =>
            prev.map((item, i) =>
                i === index
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            )
        )
    }

    function formatCourseLabel(item) {
        const corso = item.corso?.label || ''
        const livello = item.livello?.label || ''
        if (corso && livello) return `${corso} — ${livello}`
        return corso || '—'
    }

    async function handleImportFileChange(event) {
        const file = event.target.files?.[0]
        if (!file) return

        setImportFileName(file.name)
        setImportResult(null)

        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
        const mappedRows = mapImportedAthleteRows(rawRows)

        setParsedImportRows(mappedRows)
    }

    async function handleConfirmImport() {
        if (!parsedImportRows.length) {
            alert('Nessuna riga valida da importare.')
            return
        }

        setIsImporting(true)
        setImportResult(null)
        setImportToast(null)
        setImportProgress({
            current: 0,
            total: parsedImportRows.length,
            percent: 0,
            rowNumber: null,
            status: 'starting',
            message: 'Preparazione import in corso...',
        })

        try {
            const result = await importAthletesRows(parsedImportRows, {
                onProgress: (progress) => {
                    setImportProgress(progress)
                },
            })

            setImportResult(result)
            setImportToast({
                type: result.errors.length ? 'warning' : 'success',
                message: result.errors.length
                    ? `Import completato con ${result.errors.length} anomalie.`
                    : `Import completato con successo. Creati ${result.importedAthletes} atleti.`,
            })

            queryClient.invalidateQueries({ queryKey: ['atleti'] })
            queryClient.invalidateQueries({ queryKey: ['tesserati-for-athletes'] })
            queryClient.invalidateQueries({ queryKey: ['lookup-options', 'sport', 'gruppi_atleti'] })
            queryClient.invalidateQueries({ queryKey: ['lookup-options', 'sport', 'corsi'] })
            queryClient.invalidateQueries({ queryKey: ['lookup-options', 'sport', 'livelli_corso'] })
        } catch (error) {
            setImportToast({
                type: 'error',
                message: error.message || 'Errore durante importazione file.',
            })
        } finally {
            setIsImporting(false)
        }
    }

    const totalAtleti = atleti.length
    const activeAtleti = atleti.filter((item) => item.is_active !== false).length
    const medicalExpired = atleti.filter((item) => {
        if (!item.scadenza_visita_medica) return false
        return dayjs(item.scadenza_visita_medica).isBefore(dayjs(), 'day')
    }).length

    return (
        <div className="atleti-page">
            <section className="atleti-hero card-surface">
                <div>
                    <p className="eyebrow">Gestione sportiva</p>
                    <h1>Atleti</h1>
                    <p className="hero-subtitle">
                        Visualizza solo i corsisti effettivamente registrati come atleti.
                    </p>
                </div>

                <div className="hero-actions">
                    <button className="secondary-btn" onClick={handleOpenImportModal}>
                        <Upload size={18} />
                        Importa atleti
                    </button>

                    <button className="primary-btn" onClick={handleOpenCreate}>
                        <CirclePlus size={18} />
                        Nuovo atleta
                    </button>
                </div>
            </section>

            <section className="atleti-stats">
                <article className="stat-card card-surface">
                    <div className="stat-icon">
                        <Users size={18} />
                    </div>
                    <div>
                        <span>Totale atleti</span>
                        <strong>{totalAtleti}</strong>
                    </div>
                </article>

                <article className="stat-card card-surface">
                    <div className="stat-icon">
                        <IdCard size={18} />
                    </div>
                    <div>
                        <span>Attivi</span>
                        <strong>{activeAtleti}</strong>
                    </div>
                </article>

                <article className="stat-card card-surface">
                    <div className="stat-icon">
                        <HeartPulse size={18} />
                    </div>
                    <div>
                        <span>Visite scadute</span>
                        <strong>{medicalExpired}</strong>
                    </div>
                </article>
            </section>

            <section className="card-surface atleti-toolbar">
                <div className="search-field">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Cerca atleta..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </section>

            <section className="card-surface atleti-table-card">
                {atletiQuery.isLoading ? (
                    <div className="empty-state">Caricamento atleti...</div>
                ) : atletiQuery.isError ? (
                    <div className="empty-state">Errore nel caricamento degli atleti.</div>
                ) : filteredAtleti.length === 0 ? (
                    <div className="empty-state">Nessun atleta trovato.</div>
                ) : (
                    <div className="table-wrap">
                        <table className="atleti-table">
                            <thead>
                                <tr>
                                    <th>Atleta</th>
                                    <th>Contatti</th>
                                    <th>Corsi</th>
                                    <th>Tesseramento</th>
                                    <th>Visita medica</th>
                                    <th>Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAtleti.map((item) => {
                                    const medicalStatus = getMedicalStatus(item.scadenza_visita_medica)
                                    const membershipStatus = getMembershipStatus(
                                        item.scadenza_tessera,
                                        item.is_active
                                    )

                                    return (
                                        <tr key={item.id}>
                                            <td>
                                                <div className="atleta-main">
                                                    <strong>
                                                        {item.tesserato?.nome} {item.tesserato?.cognome}
                                                    </strong>
                                                    <span>
                                                        {item.tesserato?.data_nascita
                                                            ? `Nato/a il ${dayjs(item.tesserato.data_nascita).format('DD/MM/YYYY')}`
                                                            : 'Data di nascita non inserita'}
                                                    </span>
                                                </div>
                                            </td>

                                            <td>
                                                <div className="atleta-subinfo">
                                                    <span>{item.tesserato?.cellulare || '—'}</span>
                                                    <span>{item.tesserato?.email || '—'}</span>
                                                </div>
                                            </td>

                                            <td>
                                                {item.corsi?.length ? (
                                                    <div className="table-course-badges">
                                                        {item.corsi.map((courseItem) => (
                                                            <span key={courseItem.id} className="status-badge neutral">
                                                                {courseItem.corso?.label || 'Corso'}
                                                                {courseItem.livello?.label ? ` — ${courseItem.livello.label}` : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="table-muted">Nessun corso</span>
                                                )}
                                            </td>

                                            <td>
                                                <div className="status-stack">
                                                    <span className={`status-badge ${membershipStatus.tone}`}>
                                                        {membershipStatus.label}
                                                    </span>
                                                    <small>
                                                        {item.scadenza_tessera
                                                            ? `Scadenza ${dayjs(item.scadenza_tessera).format('DD/MM/YYYY')}`
                                                            : 'Nessuna scadenza'}
                                                    </small>
                                                </div>
                                            </td>

                                            <td>
                                                <div className="status-stack">
                                                    <span className={`status-badge ${medicalStatus.tone}`}>
                                                        {medicalStatus.label}
                                                    </span>
                                                    <small>
                                                        {item.scadenza_visita_medica
                                                            ? dayjs(item.scadenza_visita_medica).format('DD/MM/YYYY')
                                                            : 'Non inserita'}
                                                    </small>
                                                </div>
                                            </td>

                                            <td>
                                                <div className="row-actions">
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => handleOpenEdit(item)}
                                                        title="Modifica atleta"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={() => handleDelete(item)}
                                                        title="Elimina atleta"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {importModalOpen && (
                <div className="modal-backdrop" onClick={handleCloseImportModal}>
                    <div className="modal-card atleta-modal import-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>Importa atleti da file</h2>
                                <p>Carica un file Excel o CSV per creare automaticamente tesserati e atleti.</p>
                            </div>

                            <button className="icon-btn" onClick={handleCloseImportModal}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="import-upload-box">
                            <label className="import-file-label">
                                <FileSpreadsheet size={20} />
                                <span>Seleziona file Excel o CSV</span>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleImportFileChange}
                                    disabled={isImporting}
                                />
                            </label>

                            {importFileName && (
                                <p className="import-file-name">
                                    File caricato: <strong>{importFileName}</strong>
                                </p>
                            )}
                        </div>

                        {(isImporting || importProgress.total > 0) && (
                            <div className="import-progress-card">
                                <div className="import-progress-top">
                                    <div>
                                        <h3>Stato importazione</h3>
                                        <p>
                                            {isImporting
                                                ? 'Importazione in corso nel database...'
                                                : importResult
                                                    ? 'Importazione completata.'
                                                    : 'Importazione pronta.'}
                                        </p>
                                    </div>

                                    <strong>{importProgress.percent || 0}%</strong>
                                </div>

                                <div className="import-progress-bar">
                                    <div
                                        className="import-progress-bar-fill"
                                        style={{ width: `${importProgress.percent || 0}%` }}
                                    />
                                </div>

                                <div className="import-progress-meta">
                                    <span>
                                        {importProgress.current || 0} / {importProgress.total || 0} righe elaborate
                                    </span>
                                    {importProgress.rowNumber ? (
                                        <span>Ultima riga: {importProgress.rowNumber}</span>
                                    ) : null}
                                </div>

                                {importProgress.message ? (
                                    <div className="import-progress-message">
                                        {importProgress.message}
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {!!parsedImportRows.length && (
                            <div className="import-preview">
                                <div className="import-preview-header">
                                    <h3>Anteprima righe riconosciute</h3>
                                    <span>{parsedImportRows.length} righe</span>
                                </div>

                                <div className="table-wrap">
                                    <table className="atleti-table">
                                        <thead>
                                            <tr>
                                                <th>Corso</th>
                                                <th>Nome</th>
                                                <th>Cognome</th>
                                                <th>CF</th>
                                                <th>Numero</th>
                                                <th>Mail</th>
                                                <th>Certificato</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedImportRows.slice(0, 20).map((row) => (
                                                <tr key={`${row.rowNumber}-${row.codFiscale}-${row.email}`}>
                                                    <td>
                                                        {row.courseEntries?.length ? (
                                                            <div className="table-course-badges">
                                                                {row.courseEntries.map((entry, index) => (
                                                                    <span key={index} className="status-badge neutral">
                                                                        {entry.corsoLabel}
                                                                        {entry.livelloLabel ? ` — ${entry.livelloLabel}` : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td>{row.nome || '—'}</td>
                                                    <td>{row.cognome || '—'}</td>
                                                    <td>{row.codFiscale || '—'}</td>
                                                    <td>{row.cellulare || '—'}</td>
                                                    <td>{row.email || '—'}</td>
                                                    <td>{row.certificatoMedicoPresente ? 'Sì' : 'No'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {parsedImportRows.length > 20 && (
                                    <p className="import-note">
                                        Anteprima limitata alle prime 20 righe.
                                    </p>
                                )}
                            </div>
                        )}

                        {importToast && (
                            <div className={`import-toast ${importToast.type}`}>
                                {importToast.message}
                            </div>
                        )}

                        {importResult && (
                            <div className="import-result card-surface">
                                <h3>Risultato import</h3>
                                <div className="import-result-grid">
                                    <div><span>Righe totali</span><strong>{importResult.totalRows}</strong></div>
                                    <div><span>Nuovi atleti</span><strong>{importResult.importedAthletes}</strong></div>
                                    <div><span>Atleti aggiornati</span><strong>{importResult.updatedAthletes}</strong></div>
                                    <div><span>Nuovi tesserati</span><strong>{importResult.createdTesserati}</strong></div>
                                    <div><span>Nuovi gruppi</span><strong>{importResult.createdGroups}</strong></div>
                                    <div><span>Righe saltate</span><strong>{importResult.skippedRows}</strong></div>
                                </div>

                                {!!importResult.errors.length && (
                                    <div className="import-errors">
                                        <h4>Errori / righe saltate</h4>
                                        <div className="import-errors-list">
                                            {importResult.errors.map((item, index) => (
                                                <div key={`${item.rowNumber}-${index}`} className="import-error-item">
                                                    Riga {item.rowNumber}: {item.message}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="secondary-btn"
                                onClick={handleCloseImportModal}
                                disabled={isImporting}
                            >
                                Chiudi
                            </button>
                            <button
                                type="button"
                                className="primary-btn"
                                onClick={handleConfirmImport}
                                disabled={!parsedImportRows.length || isImporting}
                            >
                                {isImporting ? 'Importazione in corso...' : 'Importa nel database'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="modal-backdrop" onClick={handleCloseModal}>
                    <div className="modal-card atleta-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>{editingItem ? 'Modifica atleta' : 'Nuovo atleta'}</h2>
                                <p>Puoi collegare un tesserato esistente oppure crearne uno nuovo.</p>
                            </div>

                            <button className="icon-btn" onClick={handleCloseModal}>
                                <X size={18} />
                            </button>
                        </div>

                        {!editingItem && (
                            <div className="create-mode-switch">
                                <button
                                    type="button"
                                    className={createMode === 'existing' ? 'mode-btn active' : 'mode-btn'}
                                    onClick={() => setCreateMode('existing')}
                                >
                                    Da tesserato esistente
                                </button>

                                <button
                                    type="button"
                                    className={createMode === 'new' ? 'mode-btn active' : 'mode-btn'}
                                    onClick={() => setCreateMode('new')}
                                >
                                    Nuovo atleta
                                </button>
                            </div>
                        )}

                        <form className="atleta-form" onSubmit={handleSubmit}>
                            <div className="form-grid">
                                {!editingItem && createMode === 'existing' && (
                                    <label className="full-width">
                                        <span>Tesserato</span>
                                        <select
                                            name="tesserato_id"
                                            value={form.tesserato_id}
                                            onChange={handleChange}
                                        >
                                            <option value="">Seleziona tesserato</option>
                                            {availableTesserati.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.cognome} {item.nome}
                                                    {item.cellulare ? ` • ${item.cellulare}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                {(editingItem || createMode === 'new') && (
                                    <>
                                        <label>
                                            <span>Nome</span>
                                            <input name="nome" value={form.nome} onChange={handleChange} required />
                                        </label>

                                        <label>
                                            <span>Cognome</span>
                                            <input
                                                name="cognome"
                                                value={form.cognome}
                                                onChange={handleChange}
                                                required
                                            />
                                        </label>

                                        <label>
                                            <span>Data di nascita</span>
                                            <input
                                                type="date"
                                                name="data_nascita"
                                                value={form.data_nascita}
                                                onChange={handleChange}
                                            />
                                        </label>

                                        <label>
                                            <span>Codice fiscale</span>
                                            <input
                                                name="cod_fiscale"
                                                value={form.cod_fiscale}
                                                onChange={handleChange}
                                            />
                                        </label>

                                        <label>
                                            <span>Cellulare</span>
                                            <input
                                                name="cellulare"
                                                value={form.cellulare}
                                                onChange={handleChange}
                                            />
                                        </label>

                                        <label>
                                            <span>Email</span>
                                            <input
                                                type="email"
                                                name="email"
                                                value={form.email}
                                                onChange={handleChange}
                                            />
                                        </label>

                                        <label className="full-width">
                                            <span>Indirizzo</span>
                                            <input
                                                name="indirizzo"
                                                value={form.indirizzo}
                                                onChange={handleChange}
                                            />
                                        </label>

                                        <label>
                                            <span>Città</span>
                                            <input name="citta" value={form.citta} onChange={handleChange} />
                                        </label>
                                    </>
                                )}


                                <label>
                                    <span>Numero tessera</span>
                                    <input
                                        name="numero_tessera"
                                        value={form.numero_tessera}
                                        onChange={handleChange}
                                    />
                                </label>

                                <label>
                                    <span>Scadenza tessera</span>
                                    <input
                                        type="date"
                                        name="scadenza_tessera"
                                        value={form.scadenza_tessera}
                                        onChange={handleChange}
                                    />
                                </label>

                                <label>
                                    <span>Scadenza visita medica</span>
                                    <input
                                        type="date"
                                        name="scadenza_visita_medica"
                                        value={form.scadenza_visita_medica}
                                        onChange={handleChange}
                                    />
                                </label>

                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        name="certificato_medico_presente"
                                        checked={form.certificato_medico_presente}
                                        onChange={handleChange}
                                    />
                                    <span>Certificato medico presente</span>
                                </label>

                                <div className="full-width athlete-courses-box">
                                    <div className="athlete-courses-header">
                                        <div>
                                            <span className="section-title">Corsi frequentati</span>
                                            <p>Puoi assegnare più corsi e livelli allo stesso atleta.</p>
                                        </div>

                                        {editingItem && courseAssignments.some((item) => item.corso_lookup_id) && (
                                            <div className="course-summary-chips">
                                                {courseAssignments
                                                    .filter((item) => item.corso_lookup_id)
                                                    .map((item, index) => {
                                                        const corso = corsi.find((c) => c.id === item.corso_lookup_id)
                                                        const livello = livelli.find((l) => l.id === item.livello_lookup_id)

                                                        return (
                                                            <span key={index} className="status-badge neutral">
                                                                {corso?.label || 'Corso'}
                                                                {livello?.label ? ` — ${livello.label}` : ''}
                                                            </span>
                                                        )
                                                    })}
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            className="secondary-btn"
                                            onClick={addCourseAssignment}
                                        >
                                            + Aggiungi corso
                                        </button>
                                    </div>

                                    <div className="athlete-courses-list">
                                        {courseAssignments.map((assignment, index) => (
                                            <div key={index} className="course-row">
                                                <label>
                                                    <span>Corso</span>
                                                    <select
                                                        value={assignment.corso_lookup_id}
                                                        onChange={(e) =>
                                                            updateCourseAssignment(index, 'corso_lookup_id', e.target.value)
                                                        }
                                                    >
                                                        <option value="">Seleziona corso</option>
                                                        {corsi.map((item) => (
                                                            <option key={item.id} value={item.id}>
                                                                {item.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label>
                                                    <span>Livello</span>
                                                    <select
                                                        value={assignment.livello_lookup_id}
                                                        onChange={(e) =>
                                                            updateCourseAssignment(index, 'livello_lookup_id', e.target.value)
                                                        }
                                                    >
                                                        <option value="">Seleziona livello</option>
                                                        {livelli.map((item) => (
                                                            <option key={item.id} value={item.id}>
                                                                {item.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label>
                                                    <span>Note corso</span>
                                                    <input
                                                        value={assignment.note}
                                                        onChange={(e) =>
                                                            updateCourseAssignment(index, 'note', e.target.value)
                                                        }
                                                        placeholder="Facoltativo"
                                                    />
                                                </label>

                                                <button
                                                    type="button"
                                                    className="icon-btn danger course-remove-btn"
                                                    onClick={() => removeCourseAssignment(index)}
                                                    title="Rimuovi corso"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <label className="checkbox-row">
                                    <input
                                        type="checkbox"
                                        name="is_active"
                                        checked={form.is_active}
                                        onChange={handleChange}
                                    />
                                    <span>Atleta attivo</span>
                                </label>

                                <label className="full-width">
                                    <span>Note</span>
                                    <textarea
                                        name="note"
                                        rows="4"
                                        value={form.note}
                                        onChange={handleChange}
                                    />
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
                                    {editingItem ? 'Salva modifiche' : 'Crea atleta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}