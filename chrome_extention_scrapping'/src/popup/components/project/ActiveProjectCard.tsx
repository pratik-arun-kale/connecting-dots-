import { motion, AnimatePresence } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { GlassCard } from '../ui/GlassCard'
import { Button } from '../ui/Button'
import { Dot } from '../ui/Dot'
import { fadeUp } from '@/lib/motion'
import { formatRelative, cn } from '@/lib/utils'
import { useCaptureContext } from '../../hooks/useCaptureContext'
import { PLATFORM_DEFS } from '@/types/platform'

export function ActiveProjectCard() {
  const { projects, activeProjectId, setActiveTab } = useWorkspaceStore()
  const project = projects.find(p => p.id === activeProjectId) ?? null
  const { status, result, errorMsg, canCapture, capture, reset } = useCaptureContext()

  if (!project) {
    return (
      <motion.div variants={fadeUp} className="px-4 mb-1">
        <GlassCard className="border-dashed border-surface-5">
          <div className="flex flex-col items-center py-2 gap-2 text-center">
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-surface-5/70 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v10M2 7h10" stroke="#ababab" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm text-ink-3">No active project selected</p>
            <p className="text-xs text-ink-4">Choose or create a project to start capturing and searching</p>
            <Button size="sm" onClick={() => setActiveTab('projects')} className="mt-1">
              Choose Project
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    )
  }

  return (
    <motion.div variants={fadeUp} className="px-4 mb-1 space-y-2">
      {/* Project header */}
      <GlassCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Dot color={project.color} />
              <span className="text-micro text-ink-4">CURRENT PROJECT</span>
            </div>
            <h2 className="text-xl font-bold text-ink-1 tracking-tight truncate mb-1">
              {project.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span>{project.contextCount} captures</span>
              <span className="text-ink-4">·</span>
              <span>{formatRelative(project.lastActive)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            title="Switch to a different project"
            className="shrink-0 mt-0.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors cursor-pointer"
          >
            Change
          </button>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-5/60">
          <CaptureButton
            status={status}
            canCapture={canCapture}
            onCapture={capture}
          />
        </div>
      </GlassCard>

      {/* Capture result card */}
      <AnimatePresence>
        {status === 'success' && result && (
          <CaptureResultCard result={result} onDismiss={reset} />
        )}
        {status === 'error' && errorMsg && (
          <CaptureErrorCard msg={errorMsg} onDismiss={reset} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CaptureButton({
  status, canCapture, onCapture,
}: {
  status: 'idle' | 'capturing' | 'success' | 'error'
  canCapture: boolean
  onCapture: () => void
}) {
  const isCapturing = status === 'capturing'
  const isDone      = status === 'success'

  return (
    <motion.button
      whileHover={canCapture ? { scale: 1.02, y: -1 } : {}}
      whileTap={canCapture  ? { scale: 0.97 } : {}}
      onClick={canCapture ? onCapture : undefined}
      disabled={!canCapture || isCapturing}
      className={cn(
        'flex-1 flex items-center justify-center gap-2',
        'h-8 rounded-lg text-xs font-semibold',
        'transition-all duration-150',
        isDone
          ? 'bg-status-online/10 text-status-online border border-status-online/20'
          : canCapture
          ? 'bg-accent-muted text-accent border border-accent/20 hover:bg-accent/12'
          : 'bg-surface-2 text-ink-4 border border-surface-5/70 cursor-not-allowed',
      )}
    >
      {isCapturing ? (
        <>
          <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          Capturing…
        </>
      ) : isDone ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Captured
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="6" cy="6" r="1.5" fill="currentColor" />
          </svg>
          {canCapture ? 'Capture Context' : 'Open an AI tab first'}
        </>
      )}
    </motion.button>
  )
}

function CaptureResultCard({
  result, onDismiss,
}: {
  result: { title: string; platform: string; messageCount: number; capturedAt: string }
  onDismiss: () => void
}) {
  const platformColor = PLATFORM_DEFS[result.platform as keyof typeof PLATFORM_DEFS]?.color ?? '#71717a'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl p-3 bg-status-online/5 border border-status-online/20"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-status-online">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Context Captured
        </div>
        <button onClick={onDismiss} className="text-ink-4 hover:text-ink-2 transition-colors">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="text-xs font-medium text-ink-1 truncate mb-1">{result.title}</p>
      <div className="flex items-center gap-2 text-xs text-ink-4">
        <span
          className="px-1.5 py-0.5 rounded text-2xs font-semibold uppercase"
          style={{ background: platformColor + '22', color: platformColor }}
        >
          {result.platform}
        </span>
        <span>{result.messageCount} messages</span>
        <span>·</span>
        <span>{formatRelative(new Date(result.capturedAt).getTime())}</span>
      </div>
    </motion.div>
  )
}

function CaptureErrorCard({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl p-3 bg-status-offline/5 border border-status-offline/20 flex items-start justify-between gap-2"
    >
      <p className="text-xs text-status-offline">{msg}</p>
      <button onClick={onDismiss} className="text-ink-4 hover:text-ink-2 shrink-0 transition-colors">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </motion.div>
  )
}
