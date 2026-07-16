import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/motion'
import { openSidePanel } from '@/lib/utils'

/**
 * The single answer to "where is search" / "where is Ask AI" from inside the
 * popup. The popup is a transient surface (closes on outside click) so it
 * doesn't host the search box or results itself — Search and Ask AI live in
 * the side panel, which stays open alongside the chat tab. This card exists
 * so that fact is stated up front, by name, instead of the feature being
 * reachable only via an unlabeled icon.
 */
export function OpenSearchAskCard() {
  return (
    <motion.div variants={fadeUp} className="px-4 mb-1">
      <button
        type="button"
        onClick={() => void openSidePanel()}
        className="w-full text-left rounded-xl p-4 bg-accent-muted border border-accent/20 hover:bg-accent/[0.12] transition-colors cursor-pointer group"
      >
        <p className="text-sm font-semibold text-ink-1 mb-0.5">
          Find or ask about your knowledge
        </p>
        <p className="text-xs text-ink-3 mb-3">
          Search previous conversations or ask AI questions about what you've captured.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
          Open Search &amp; Ask AI
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="transition-transform group-hover:translate-x-0.5">
            <path d="M2 8L8 2M8 2H4M8 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </motion.div>
  )
}
