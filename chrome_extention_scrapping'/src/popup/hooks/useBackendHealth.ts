import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export function useBackendHealth() {
  const setOnline  = useWorkspaceStore(s => s.setBackendOnline)
  const setSyncing = useWorkspaceStore(s => s.setSyncing)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const ok = await api.health()
      if (!cancelled) setOnline(ok)
    }

    check()
    const interval = setInterval(check, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [setOnline, setSyncing])
}
