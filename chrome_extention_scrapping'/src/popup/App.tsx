import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { PopupShell } from './components/layout/PopupShell'
import { Header }    from './components/layout/Header'
import { NavBar }    from './components/layout/NavBar'
import { HomePage }      from './pages/HomePage'
import { ProjectsPage }   from './pages/ProjectsPage'
import { useBackendHealth }  from './hooks/useBackendHealth'
import { usePlatformTabs }   from './hooks/usePlatformTabs'
import { useProjects }       from './hooks/useProjects'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function App() {
  // Bootstrap hooks
  useBackendHealth()
  usePlatformTabs()
  useProjects()  // fetch immediately, retry, cache — moved from page-level to app-level

  const activeTab = useWorkspaceStore(s => s.activeTab)

  return (
    <PopupShell>
      <Header />

      {/* Page area */}
      <div className="relative flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Anything other than 'projects' (including a stale persisted
                'workspace'/'platforms' value from before this redesign)
                falls back to Home. */}
            {activeTab === 'projects' ? <ProjectsPage /> : <HomePage />}
          </motion.div>
        </AnimatePresence>
      </div>

      <NavBar />
    </PopupShell>
  )
}
