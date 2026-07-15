import { useCallback, useEffect, useState } from 'react'
import { getNovaModulesData, subscribeNovaModules, updateNovaModulesData } from '../lib/novaModulesStore'
import { useAuth } from '../context/AuthProvider'

export default function useNovaModules() {
  const { user } = useAuth()
  const [data, setData] = useState(getNovaModulesData)

  useEffect(() => subscribeNovaModules(setData), [])

  const commit = useCallback(
    (updater, audit) => {
      const enrichedAudit = audit
        ? { ...audit, actor: user?.email || audit.actor || 'Admin Nova' }
        : null
      setData(updateNovaModulesData(updater, enrichedAudit))
    },
    [user?.email]
  )

  return { data, commit }
}
