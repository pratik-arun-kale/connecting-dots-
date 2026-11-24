import { motion } from 'framer-motion'
import { useWorkspaceStore, type ActiveTab } from '@/store/useWorkspaceStore'
import { cn } from '@/lib/utils'
import { SPRING } from '@/lib/motion'

// Collapsed from 3 tabs (Workspace/Projects/Platforms) to 2 — "Platforms"
// duplicated data already shown compactly on Home (PlatformStatusRow), and
// "Workspace" was a vague catch-all. Search/Ask AI are intentionally NOT
// tabs here — see OpenSearchAskCard; they live in the side panel.
const TABS: { id: ActiveTab; label: string; Icon: () => React.ReactElement }[] = [
  {
    id: 'home',
    label: 'Home',
    Icon: () => (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 6.5L7 2l5 4.5M3 5.5V12h8V5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    Icon: () => (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 4a2 2 0 012-2h2.586a1 1 0 01.707.293L7 3h4a2 2 0 012 2v5a2 2 0 01-2 2H3a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function NavBar() {
  const { activeTab, setActiveTab } = useWorkspaceStore()

  return (
    <nav className="shrink-0 px-3 pb-3 pt-2 border-t border-surface-5/50">
      <div className="flex items-center bg-surface-2 rounded-lg p-1 gap-0.5">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md',
                'text-xs font-medium transition-colors duration-150',
                isActive ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-white rounded-md shadow-card"
                  transition={SPRING}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <tab.Icon />
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
