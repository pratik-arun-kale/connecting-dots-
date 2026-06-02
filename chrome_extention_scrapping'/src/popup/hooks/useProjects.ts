/**
 * useProjects — production-grade project loader.
 *
 * Design:
 *  - Fetches immediately on mount (does NOT wait for backendOnline).
 *  - Shows cached projects from the store while a fresh fetch is in flight.
 *  - Retries up to MAX_RETRIES times with exponential backoff.
 *  - Records lastSyncAt, syncError, projectsTotal in the store for the diagnostics bar.
 *  - When offline (fetch fails): leaves cached projects in place, sets backendOnline=false.
 */
import { useEffect, useRef } from 'react'
import { api, ApiError, type ApiProjectItem } from '@/lib/api'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { normalizeProject } from '@/types/project'

const MAX_RETRIES   = 3
const BASE_DELAY_MS = 1_500

async function fetchWithRetry(): Promise<ApiProjectItem[]> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4)
      await new Promise(r => setTimeout(r, delay))
    }
    try {
      return await api.getProjects()
    } catch (err) {
      lastErr = err
      // Don't retry on 4xx (client errors are not transient)
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) break
    }
  }
  throw lastErr
}

export function useProjects() {
  const {
    setProjects,
    setBackendOnline,
    setLastSyncAt,
    setSyncError,
    setProjectsTotal,
    setSyncing,
  } = useWorkspaceStore()

  const inFlight = useRef(false)

  const load = async (signal?: AbortSignal) => {
    if (inFlight.current) return
    inFlight.current = true
    setSyncing(true)
    setSyncError(null)

    try {
      const items = await fetchWithRetry()
      if (signal?.aborted) return

      const projects = items.map((p, i) => normalizeProject(p, i))
      setProjects(projects)
      setProjectsTotal(items.length)
      setBackendOnline(true)
      setLastSyncAt(Date.now())
    } catch (err) {
      if (signal?.aborted) return
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setSyncError(msg)
      setBackendOnline(false)
      console.warn('[useProjects] fetch failed:', msg)
    } finally {
      if (!signal?.aborted) setSyncing(false)
      inFlight.current = false
    }
  }

  useEffect(() => {
    const ctrl = new AbortController()

    // Fetch immediately — don't wait for health check
    void load(ctrl.signal)

    // Re-sync every 30s while popup is open
    const interval = setInterval(() => void load(ctrl.signal), 30_000)

    return () => {
      ctrl.abort()
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
