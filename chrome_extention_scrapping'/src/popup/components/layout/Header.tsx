import { StatusPill } from '../status/StatusPill'

// The unlabeled search-icon button that used to live here is gone — it was
// exactly the kind of hidden affordance the redesign is meant to remove.
// "Where is search" is now answered by name on the Home screen
// (OpenSearchAskCard), not by a tooltip on a magnifying-glass icon.
export function Header() {
  return (
    <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-surface-5/60 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-ink-1 flex items-center justify-center shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.95" />
            <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
            <rect x="7" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.95" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-ink-1 tracking-tight">
          Context Workspace
        </span>
      </div>

      <StatusPill />
    </header>
  )
}
