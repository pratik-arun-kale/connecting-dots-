import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { GlassCard } from '../components/ui/GlassCard'
import { SectionLabel } from '../components/ui/SectionLabel'
import { ScrollArea } from '../components/layout/PopupShell'
import { PLATFORM_DEFS, type PlatformId } from '@/types/platform'
import { formatRelative, cn } from '@/lib/utils'
import { stagger, fadeUp } from '@/lib/motion'

const ORDER: PlatformId[] = ['chatgpt', 'claude', 'gemini', 'perplexity']

export function PlatformsPage() {
  const platforms = useWorkspaceStore(s => s.platforms)
  const connected = ORDER.filter(id => platforms[id].connected)
  const idle      = ORDER.filter(id => !platforms[id].connected)

  return (
    <ScrollArea>
      <motion.div variants={stagger} initial="hidden" animate="show" className="px-4 py-3 space-y-4">

        {connected.length > 0 && (
          <section>
            <SectionLabel>Connected</SectionLabel>
            <div className="space-y-2">
              {connected.map(id => <PlatformRow key={id} id={id} />)}
            </div>
          </section>
        )}

        <section>
          <SectionLabel>{connected.length > 0 ? 'Available' : 'All Platforms'}</SectionLabel>
          <div className="space-y-2">
            {(connected.length > 0 ? idle : ORDER).map(id => <PlatformRow key={id} id={id} />)}
          </div>
        </section>

      </motion.div>
    </ScrollArea>
  )
}

function PlatformRow({ id }: { id: PlatformId }) {
  const platform = useWorkspaceStore(s => s.platforms[id])
  const def      = PLATFORM_DEFS[id]

  const handleOpen = () => chrome.tabs.create({ url: def.url })

  return (
    <motion.div variants={fadeUp}>
      <GlassCard onClick={handleOpen} className="group">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: def.color + '1a', color: def.color }}
          >
            {def.label.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink-1">{def.label}</p>
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                platform.connected ? 'bg-status-online animate-pulse-dot' : 'bg-surface-5',
              )} />
            </div>
            <p className="text-xs text-ink-4 mt-0.5">
              {platform.connected
                ? `${platform.activeTabCount} active tab${platform.activeTabCount !== 1 ? 's' : ''}${platform.lastActivity ? ` · ${formatRelative(platform.lastActivity)}` : ''}`
                : 'Not open — click to launch'
              }
            </p>
          </div>

          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-ink-4 group-hover:text-ink-2 transition-colors shrink-0">
            <path d="M2 10L10 2M10 2H5M10 2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </GlassCard>
    </motion.div>
  )
}
