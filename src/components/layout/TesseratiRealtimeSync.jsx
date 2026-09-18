import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { orchideaSupabase } from '../../api/orchideaSupabase'
import { invalidateTesseratiCache } from '../../api/tesserati'

const REGISTRY_QUERY_KEYS = [
  ['tesseramenti-orchidea'],
  ['orchidea-atleti-corsisti'],
  ['dashboard-registry'],
  ['utilities-students'],
  ['orchidea-students-for-course-picker'],
  ['medical-students'],
]

export default function TesseratiRealtimeSync() {
  const queryClient = useQueryClient()
  const debounceRef = useRef(null)
  const lastRevisionRef = useRef(null)
  const revisionFailuresRef = useRef(0)

  useEffect(() => {
    let channel = null
    let pollingTimer = null
    let disposed = false

    const refreshRegistry = ({ immediate = false } = {}) => {
      if (disposed) return

      const run = () => {
        if (disposed) return
        invalidateTesseratiCache()
        REGISTRY_QUERY_KEYS.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
        })
      }

      if (immediate) {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = null
        run()
        return
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(run, 250)
    }

    const checkRevision = async () => {
      if (disposed || document.visibilityState !== 'visible') return

      try {
        const { data, count, error } = await orchideaSupabase
          .from('tesseramenti')
          .select('id, updated_at, created_at', { count: 'exact' })
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1)

        if (error) throw error

        revisionFailuresRef.current = 0
        const latest = data?.[0] || null
        const signature = `${Number(count || 0)}|${latest?.updated_at || latest?.created_at || latest?.id || ''}`

        if (lastRevisionRef.current !== null && signature !== lastRevisionRef.current) {
          refreshRegistry({ immediate: true })
        }
        lastRevisionRef.current = signature
      } catch {
        // Se il controllo leggero non è disponibile, facciamo un refresh
        // completo solo ogni ~30 secondi: evita di martellare il database ma
        // garantisce comunque che un nuovo tesseramento compaia senza F5.
        revisionFailuresRef.current += 1
        if (revisionFailuresRef.current % 3 === 0) {
          refreshRegistry({ immediate: true })
        }
      }
    }

    channel = orchideaSupabase
      .channel('nova-tesseramenti-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tesseramenti' },
        () => refreshRegistry()
      )
      .subscribe()

    // Realtime è il percorso principale (aggiornamento immediato). Questo
    // controllo molto leggero è un paracadute: ogni 10s legge solo conteggio e
    // ultima modifica; scarica l'intera anagrafica soltanto se rileva novità.
    checkRevision()
    pollingTimer = window.setInterval(checkRevision, 10_000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Sul tablet il passaggio tra app/schede generava prima un refetch completo
        // di centinaia di anagrafiche ad ogni focus. Controlliamo invece solo la
        // revisione leggera e invalidiamo la cache esclusivamente se è cambiato
        // davvero qualcosa nel portale tesserati.
        checkRevision()
      }
    }

    window.addEventListener('focus', handleVisibility)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (pollingTimer) window.clearInterval(pollingTimer)
      window.removeEventListener('focus', handleVisibility)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (channel) orchideaSupabase.removeChannel(channel)
    }
  }, [queryClient])

  return null
}
