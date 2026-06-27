import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { BackendStatus } from '../popup/components/status/BackendStatus'
import { SessionItem } from '../popup/components/session/SessionItem'
import { SectionLabel } from '../popup/components/ui/SectionLabel'
import { Button } from '../popup/components/ui/Button'
import { GlassCard } from '../popup/components/ui/GlassCard'
import { Dot } from '../popup/components/ui/Dot'
import { stagger, fadeUp } from '@/lib/motion'
import { formatRelative } from '@/lib/utils'
import { useBackendHealth } from '../popup/hooks/useBackendHealth'
import { useContexts } from '../popup/hooks/useContexts'

export function SidePanelApp() {
  useBackendHealth()
  const { loading } = useContexts()

  const { projects, activeProjectId, backendOnline, syncing, contexts } = useWorkspaceStore()
  const project = projects.find(p => p.id === activeProjectId) ?? null

  return (
    <div className="w-full min-h-screen bg-surface-1 text-ink-1 font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-surface-5/60 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-ink-1 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-ink-1">Context Workspace</span>
        </div>
        <BackendStatus online={backendOnline} syncing={syncing} />
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scroll-hide py-4 px-4 space-y-5">

        {/* Active project */}
        {project && (
          <section>
            <SectionLabel>Active Project</SectionLabel>
            <GlassCard hoverable={false}>
              <div className="flex items-center gap-3">
                <Dot color={project.color} size="md" />
                <div>
                  <p className="text-md font-bold text-ink-1">{project.name}</p>
                  <p className="text-xs text-ink-4 mt-0.5">
                    {project.contextCount} captures · {formatRelative(project.lastActive)}
                  </p>
                </div>
              </div>
            </GlassCard>
          </section>
        )}

        {/* Recent captures */}
        <section>
          <SectionLabel>Recent Captures</SectionLabel>
          {loading ? (
            <p className="text-xs text-ink-4 py-2">Loading…</p>
          ) : contexts.length === 0 ? (
            <p className="text-xs text-ink-3 py-4 text-center">No captures for this project yet.</p>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-0.5">
              {contexts.slice(0, 12).map(ctx => (
                <SessionItem key={ctx.id} context={ctx} />
              ))}
            </motion.div>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'ChatGPT', url: 'https://chatgpt.com' },
              { label: 'Claude',  url: 'https://claude.ai' },
              { label: 'Gemini',  url: 'https://gemini.google.com' },
              { label: 'Perplexity', url: 'https://www.perplexity.ai' },
            ].map(({ label, url }) => (
              <Button key={label} variant="surface" size="sm" onClick={() => chrome.tabs.create({ url })}>
                {label}
              </Button>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
