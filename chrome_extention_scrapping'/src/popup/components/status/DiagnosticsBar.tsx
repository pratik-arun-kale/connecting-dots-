import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { cn, formatRelative } from '@/lib/utils'
import { api } from '@/lib/api'

export function DiagnosticsBar() {
  const {
    backendOnline, syncing, lastSyncAt, syncError,
    projectsTotal, setBackendOnline, setSyncing,
    setLastSyncAt, setSyncError, setProjects, setProjectsTotal,
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-surface-5/60"
    >
      {/* Status dot */}
      <div className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        syncing        ? 'bg-status-syncing animate-pulse-dot'
        : backendOnline ? 'bg-status-online animate-pulse-dot'
        :                'bg-status-offline',
      )} />

      {/* Label */}
      <span className="text-2xs font-medium text-ink-3 flex-1 min-w-0">
        {syncing
          ? 'Syncing…'
          : syncError
          ? <span className="text-status-offline truncate block">{syncError}</span>
          : backendOnline
          ? `${projectsTotal} project${projectsTotal !== 1 ? 's' : ''} loaded`
          : 'Backend offline — showing cached'}
      </span>

      {/* Last sync time */}
      {lastSyncAt && !syncError && (
        <span className="text-2xs text-ink-4 shrink-0 whitespace-nowrap">
          {formatRelative(lastSyncAt)}
        </span>
      )}

      {/* Retry button — only when error */}
      {syncError && !syncing && (
        <button
          onClick={handleRetry}
          className="text-2xs font-semibold text-accent hover:text-accent/80 shrink-0 transition-colors"
        >
          Retry
        </button>
      )}
    </motion.div>
  )
}
