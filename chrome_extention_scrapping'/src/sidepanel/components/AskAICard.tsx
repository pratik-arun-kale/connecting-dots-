import { useWorkspaceStore } from '@/store/useWorkspaceStore'

// Matches the localhost:3000 origin already allowlisted in manifest
// host_permissions/externally_connectable (same convention as
// src/search/api/searchClient.ts hardcoding the :8000 backend origin —
// this extension has no env-config system, so both bases are literal).
const DASHBOARD_BASE = 'http://localhost:3000'

/**
 * Ask AI generates answers from your captured knowledge (distinct from
 * Search, which only retrieves — see SearchPreviousConversations's
 * docstring). Deep-links into the web dashboard's Ask AI tab rather than
 * being reimplemented inside the extension: the dashboard's Ask AI already
 * has streaming/citation UI built for it, and duplicating that here would
 * be a second implementation of the same feature to keep in sync.
 */
export function AskAICard() {
  const activeProjectId = useWorkspaceStore(s => s.activeProjectId)

  const handleOpen = () => {
    if (!activeProjectId) return
    const url = `${DASHBOARD_BASE}/projects/${activeProjectId}?tab=ask`
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url, active: true })
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <section aria-label="Ask AI about your knowledge">
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-ink-4 dark:text-white/40">
          <rect x="2" y="3" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 10v1.5M9 10v1.5M4.5 6h.01M9.5 6h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="text-micro text-ink-4 dark:text-white/40 uppercase tracking-wide">
          Ask AI About Your Knowledge
        </span>
      </div>
      <p className="text-2xs text-ink-3 dark:text-white/50 px-1 mb-2">
        Ask questions using your saved knowledge — answers are generated, not just retrieved.
      </p>

      <button
        type="button"
        onClick={handleOpen}
        disabled={!activeProjectId}
        className="w-full text-left rounded-lg border border-surface-5/60 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <p className="text-xs text-ink-4 dark:text-white/40 italic mb-2">
          "Explain how NVIDIA built its moat…"
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
          Open Ask AI in Dashboard
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 8L8 2M8 2H4M8 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {!activeProjectId && (
        <p className="text-2xs text-ink-4 dark:text-white/40 px-1 mt-1">
          Select a project to ask questions about its captured knowledge.
        </p>
      )}
    </section>
  )
}
