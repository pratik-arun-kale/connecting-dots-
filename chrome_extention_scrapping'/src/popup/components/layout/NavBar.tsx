import { motion } from 'framer-motion'
import { useWorkspaceStore, type ActiveTab } from '@/store/useWorkspaceStore'
import { cn } from '@/lib/utils'
import { SPRING } from '@/lib/motion'

const TABS: { id: ActiveTab; label: string; Icon: () => React.ReactElement }[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    Icon: () => (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="8" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
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
  {
    id: 'platforms',
    label: 'Platforms',
    Icon: () => (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
