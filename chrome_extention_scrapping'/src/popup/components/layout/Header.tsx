import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { BackendStatus } from '../status/BackendStatus'

export function Header() {
  const backendOnline = useWorkspaceStore(s => s.backendOnline)
  const syncing       = useWorkspaceStore(s => s.syncing)

  return (
    <header className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
      <div className="flex items-center gap-2.5">
        {/* Logo mark */}
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center shadow-glow-sm shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
            <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="7" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-ink-1 tracking-tight">
          Context Workspace
        </span>
      </div>

      <BackendStatus online={backendOnline} syncing={syncing} />
    </header>
  )
}
