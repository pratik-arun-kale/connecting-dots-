import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { SessionItem } from '../popup/components/session/SessionItem'
import { SectionLabel } from '../popup/components/ui/SectionLabel'
import { StatusPill } from '../popup/components/status/StatusPill'
import { PlatformStatusRow } from '../popup/components/platform/PlatformStatusRow'
import { stagger } from '@/lib/motion'
import { useBackendHealth } from '../popup/hooks/useBackendHealth'
import { useContexts } from '../popup/hooks/useContexts'
import { useSystemTheme } from '@/search/hooks/useSystemTheme'
import { SearchPreviousConversations } from '@/search/components/SearchPreviousConversations'
import { OnboardingSteps } from './components/OnboardingSteps'
import { CurrentProjectSection } from './components/CurrentProjectSection'
import { AskAICard } from './components/AskAICard'

/**
 * The side panel is the extension's full-featured surface (see the IA
 * redesign): unlike the popup, it stays open alongside the chat tab, so
 * Search and Ask AI — the two features people most need "without leaving
 * the current chat" — live here, each clearly labeled with its own title,
 * subtitle, and example queries rather than sharing space with project
 * management chrome.
 */
export function SidePanelApp() {
  useBackendHealth()
  useSystemTheme()
  const { loading } = useContexts()
  const contexts = useWorkspaceStore(s => s.contexts)

  return (
    <div className="w-full h-full bg-surface-1 dark:bg-[#141416] text-ink-1 dark:text-white font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-surface-5/60 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-ink-1 dark:bg-white/90 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" className="fill-white dark:fill-[#141416]" fillOpacity="0.9" />
              <rect x="7" y="1" width="4" height="4" rx="1" className="fill-white dark:fill-[#141416]" fillOpacity="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="1" className="fill-white dark:fill-[#141416]" fillOpacity="0.5" />
              <rect x="7" y="7" width="4" height="4" rx="1" className="fill-white dark:fill-[#141416]" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Context Vault</span>
        </div>
        <StatusPill />
      </header>

      {/* Scrollable body */}
      {/* min-h-0 is load-bearing: flex items default to min-height:auto, which
          lets this div grow to fit its content instead of clipping to the
          space flex-1 actually leaves it — silently defeating overflow-y-auto
          even once the ancestor height chain (see sidepanel.html) is bounded.
          No `.scroll-hide` here (unlike the popup's ScrollArea) — the bug
          report requires a visible scrollbar when content overflows. */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-4 space-y-5">

        <OnboardingSteps />

        <CurrentProjectSection />

        <SearchPreviousConversations />

        <AskAICard />

        <section>
          <PlatformStatusRow />
        </section>

        {/* Recent captures */}
        <section>
          <SectionLabel>Recent Captures</SectionLabel>
          {loading ? (
            <p className="text-xs text-ink-4 dark:text-white/40 py-2">Loading…</p>
          ) : contexts.length === 0 ? (
            <p className="text-xs text-ink-3 dark:text-white/50 py-4 text-center">No captures for this project yet.</p>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-0.5">
              {contexts.slice(0, 12).map(ctx => (
                <SessionItem key={ctx.id} context={ctx} />
              ))}
            </motion.div>
          )}
        </section>

      </div>
    </div>
  )
}
