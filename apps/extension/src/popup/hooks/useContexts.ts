import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { normalizeContext, type ApiContext } from '@/types/context'

export function useContexts() {
  const [loading, setLoading] = useState(true)
  const { activeProjectId, backendOnline, setContexts } = useWorkspaceStore()

  useEffect(() => {
    if (!backendOnline || !activeProjectId) { setLoading(false); return }

    let cancelled = false
    setLoading(true)

    api.getContexts(activeProjectId)
      .then(raw => {
        if (cancelled) return
        setContexts((raw as ApiContext[]).map(normalizeContext))
      })
      .catch(err => console.warn('[useContexts]', err))
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [activeProjectId, backendOnline, setContexts])

  return { loading }
}
