import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { ActiveProjectCard } from '../components/project/ActiveProjectCard'
import { PlatformGrid } from '../components/platform/PlatformGrid'
import { SessionList } from '../components/session/SessionList'
import { ScrollArea } from '../components/layout/PopupShell'
import { stagger } from '@/lib/motion'
import { useContexts } from '../hooks/useContexts'

export function WorkspacePage() {
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
        <PlatformGrid />
        <SessionList contexts={contexts} loading={loading} />
        {/* Bottom padding so last item isn't cut by nav */}
        <div className="h-1" />
      </motion.div>
    </ScrollArea>
  )
}
