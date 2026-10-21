import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { ActiveProjectCard } from '../components/project/ActiveProjectCard'
import { OpenSearchAskCard } from '../components/discovery/OpenSearchAskCard'
import { PlatformStatusRow } from '../components/platform/PlatformStatusRow'
import { SessionList } from '../components/session/SessionList'
import { ScrollArea } from '../components/layout/PopupShell'
import { stagger } from '@/lib/motion'
import { useContexts } from '../hooks/useContexts'

/**
 * The popup's single screen — replaces the old Workspace/Platforms tab pair.
 * "Lightweight launcher": current project + capture here, but Search and Ask
 * AI are a named hand-off to the side panel (OpenSearchAskCard) rather than
 * embedded, since the popup closes on outside click and can't stay open
 * alongside the chat tab the way the side panel does.
 */
export function HomePage() {
  const contexts = useWorkspaceStore(s => s.contexts)
  const { loading } = useContexts()

  return (
    <ScrollArea>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="py-3 space-y-4"
      >
        <ActiveProjectCard />
        <OpenSearchAskCard />
        <div className="px-4">
          <PlatformStatusRow />
        </div>
        <SessionList contexts={contexts} loading={loading} />
        {/* Bottom padding so last item isn't cut by nav */}
        <div className="h-1" />
      </motion.div>
    </ScrollArea>
  )
}
