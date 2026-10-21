import { AnimatePresence, motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { LoginGate } from '@/components/auth/LoginGate'
import { PopupShell } from './components/layout/PopupShell'
import { Header }    from './components/layout/Header'
import { NavBar }    from './components/layout/NavBar'
import { HomePage }      from './pages/HomePage'
import { ProjectsPage }   from './pages/ProjectsPage'
import { useBackendHealth }  from './hooks/useBackendHealth'
import { usePlatformTabs }   from './hooks/usePlatformTabs'
import { useProjects }       from './hooks/useProjects'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// Bootstrap hooks that hit the backend (platform tabs, projects) only make
// sense once signed in — they're called inside this inner component, which
// LoginGate only mounts after authentication, rather than in App() itself
// (which would fire wasted 401s from a logged-out popup on every open).
function AuthenticatedPopup() {
  usePlatformTabs()
  useProjects()  // fetch immediately, retry, cache — moved from page-level to app-level

  const activeTab = useWorkspaceStore(s => s.activeTab)

  return (
    <>
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
    </>
  )
}

export function App() {
  // /health has no auth requirement — safe to check regardless of login state.
  useBackendHealth()

  // PopupShell wraps LoginGate (not the other way around) so the popup keeps
  // its fixed 420px box on the login screen too — Chrome extension popups
  // have no viewport of their own and shrink-wrap to fit content, so without
  // an always-present sized shell, the login form alone rendered as a
  // squished ~160px column instead of the normal popup size.
  return (
    <PopupShell>
      <LoginGate>
        <AuthenticatedPopup />
      </LoginGate>
    </PopupShell>
  )
}
