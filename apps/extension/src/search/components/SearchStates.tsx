import { motion } from 'framer-motion'
import { fadeIn } from '@/lib/motion'
import type { SafeSearchSuggestions, SearchError } from '../types'

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2" role="status" aria-live="polite">
      <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      <p className="text-xs text-ink-3 dark:text-white/50">Searching your captured conversations…</p>
    </div>
  )
}

export function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center" role="alert">
      <div className="w-8 h-8 rounded-full bg-status-offline/10 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-status-offline" />
      </div>
      <p className="text-sm font-medium text-ink-1 dark:text-white">You're offline</p>
      <p className="text-xs text-ink-3 dark:text-white/50">Reconnect and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 text-xs font-medium text-accent hover:underline cursor-pointer"
      >
        Retry
      </button>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: SearchError; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 px-3 text-center rounded-lg bg-status-offline/5 border border-status-offline/20" role="alert">
      <p className="text-sm font-medium text-status-offline">Search failed</p>
      <p className="text-xs text-ink-3 dark:text-white/60">{error.message}</p>
      {error.retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-xs font-medium text-accent hover:underline cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Precondition state — shown INSTEAD of the search box when the active
 * project has zero captured conversations. Distinct from EmptyState (which
 * means "you searched and nothing matched"): this means "there's nothing to
 * search yet", so it explains why rather than presenting a search box that
 * can only ever come back empty.
 */
export function NoConversationsIndexedState({ onCapture, canCapture }: { onCapture: () => void; canCapture: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
      <div className="w-8 h-8 rounded-full bg-surface-2 dark:bg-white/10 flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink-4 dark:text-white/40">
          <rect x="2" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4.5 6h5M4.5 8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-1 dark:text-white">No conversations indexed yet</p>
      <p className="text-xs text-ink-3 dark:text-white/50 max-w-[240px]">
        Capture a conversation first to enable search.
      </p>
      <button
        type="button"
        onClick={onCapture}
        disabled={!canCapture}
        className="mt-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        Capture Current Chat
      </button>
    </div>
  )
}

export function EmptyState({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: SafeSearchSuggestions | null
  onSuggestionClick: (query: string) => void
}) {
  const chips = [
    ...(suggestions?.closestTopics ?? []),
    ...(suggestions?.closestTechnologies ?? []),
  ].slice(0, 6)

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="show" className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <p className="text-sm text-ink-2 dark:text-white/70">No conversations matched this topic.</p>
      <p className="text-xs text-ink-4 dark:text-white/40">Try a different keyword or capture more conversations.</p>

      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          <span className="text-2xs text-ink-4 dark:text-white/40 w-full mb-1">Did you mean?</span>
          {chips.map(chip => (
            <button
              key={chip}
              type="button"
              onClick={() => onSuggestionClick(chip)}
              className="text-2xs px-2 py-1 rounded-full border border-surface-5 dark:border-white/15 text-ink-2 dark:text-white/70 hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {suggestions && suggestions.relatedConversations.length > 0 && (
        <p className="text-2xs text-ink-4 dark:text-white/40 mt-1">
          {suggestions.relatedConversations.length} related conversation{suggestions.relatedConversations.length === 1 ? '' : 's'} found by topic similarity.
        </p>
      )}
    </motion.div>
  )
}
