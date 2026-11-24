import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { cn, formatRelative } from '@/lib/utils'
import { api } from '@/lib/api'

/**
 * Single source of truth for "is the backend reachable / are we syncing /
 * did the last sync fail" — replaces the old pairing of a header dot
 * (online/offline only) plus a separate full-width DiagnosticsBar (syncing/
 * project-count/error/retry). Two indicators for one fact was exactly the
 * kind of redundant status display called out in the UX audit.
 */
export function StatusPill() {
  const {
    backendOnline, syncing, lastSyncAt, syncError, projectsTotal,
    setBackendOnline, setSyncing, setLastSyncAt, setSyncError, setProjects, setProjectsTotal,
  } = useWorkspaceStore()

  const handleRetry = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const items = await api.getProjects()
      const { normalizeProject } = await import('@/types/project')
      setProjects(items.map((p, i) => normalizeProject(p, i)))
      setProjectsTotal(items.length)
      setBackendOnline(true)
      setLastSyncAt(Date.now())
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Retry failed')
      setBackendOnline(false)
    } finally {
      setSyncing(false)
    }
  }

  const label = syncing
    ? 'Syncing…'
    : syncError
    ? 'Sync failed'
    : backendOnline
    ? `${projectsTotal} project${projectsTotal !== 1 ? 's' : ''}`
    : 'Offline'

  const title = syncError
    ? syncError
    : lastSyncAt && !syncing
    ? `Last synced ${formatRelative(lastSyncAt)}`
    : undefined

  return (
    <motion.button
      type="button"
      onClick={syncError && !syncing ? () => void handleRetry() : undefined}
      title={title}
      aria-label={title ? `${label} — ${title}` : label}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold shrink-0',
        syncing        ? 'bg-status-syncing/10 text-status-syncing'
        : syncError     ? 'bg-status-offline/10 text-status-offline cursor-pointer'
        : backendOnline ? 'bg-status-online/10 text-status-online'
        :                 'bg-status-offline/10 text-status-offline',
      )}
    >
      <div className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        syncing        ? 'bg-status-syncing animate-pulse-dot'
        : syncError     ? 'bg-status-offline'
        : backendOnline ? 'bg-status-online animate-pulse-dot'
        :                 'bg-status-offline',
      )} />
      {label}
      {syncError && !syncing && <span className="underline">Retry</span>}
    </motion.button>
  )
}
