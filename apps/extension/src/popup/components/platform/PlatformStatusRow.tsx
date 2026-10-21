import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { PLATFORM_DEFS, type PlatformId } from '@/types/platform'
import { cn } from '@/lib/utils'

const ORDER: PlatformId[] = ['chatgpt', 'claude', 'gemini', 'perplexity']

/**
 * Replaces the old 2x2 grid (inside the Workspace tab) AND the separate,
 * fuller "Platforms" tab — both showed the exact same connection data at
 * different levels of detail. One compact row, reused by both the popup
 * Home and the side panel, is enough: connection state at a glance, click a
 * platform to open/focus it.
 */
export function PlatformStatusRow() {
  const platforms = useWorkspaceStore(s => s.platforms)
  const connectedCount = ORDER.filter(id => platforms[id].connected).length

  return (
    <section aria-label="AI platform connections">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="text-micro text-ink-4 dark:text-white/40">AI Platforms</span>
        <span className="text-2xs text-ink-4 dark:text-white/40">
          {connectedCount} connected
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {ORDER.map(id => {
          const def = PLATFORM_DEFS[id]
          const platform = platforms[id]
          return (
            <button
              key={id}
              type="button"
              title={platform.connected
                ? `${def.label} — ${platform.activeTabCount} active tab${platform.activeTabCount !== 1 ? 's' : ''}`
                : `${def.label} — not open, click to launch`}
              aria-label={`${def.label}: ${platform.connected ? 'connected' : 'not connected'}`}
              onClick={() => chrome.tabs.create({ url: def.url })}
              className="flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg border border-surface-5/60 dark:border-white/10 hover:border-accent/40 transition-colors cursor-pointer"
            >
              <span className="relative flex items-center justify-center">
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-2xs font-bold"
                  style={{ background: def.color + '1a', color: def.color }}
                >
                  {def.label.charAt(0)}
                </span>
                <span className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-[#1c1c1e]',
                  platform.connected ? 'bg-status-online' : 'bg-surface-5 dark:bg-white/20',
                )} />
              </span>
              <span className="text-2xs text-ink-3 dark:text-white/50">{def.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
