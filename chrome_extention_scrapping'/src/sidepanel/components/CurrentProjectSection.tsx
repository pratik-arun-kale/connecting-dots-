import { useState } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useCaptureContext } from '../../popup/hooks/useCaptureContext'
import { formatRelative, cn } from '@/lib/utils'
import { Dot } from '../../popup/components/ui/Dot'

/**
 * The side panel's own project picker — it can't rely on the popup's
 * Projects tab (a side panel and a popup are separate top-level surfaces;
 * there's no reliable, gesture-free way to pop the popup open from here), so
 * "Choose Project" has to actually work standalone. A native <select> keeps
 * this simple, keyboard-accessible, and screen-reader friendly without a
 * bespoke dropdown component just for this.
 */
export function CurrentProjectSection() {
  const projects = useWorkspaceStore(s => s.projects)
  const activeProjectId = useWorkspaceStore(s => s.activeProjectId)
  const setActiveProject = useWorkspaceStore(s => s.setActiveProject)
  const project = projects.find(p => p.id === activeProjectId) ?? null
  const [pickerOpen, setPickerOpen] = useState(false)
  const { status, canCapture, capture } = useCaptureContext()

  if (!project) {
    return (
      <section aria-label="Current project" className="rounded-xl border border-dashed border-surface-5 dark:border-white/15 p-3 text-center space-y-2">
        <p className="text-sm text-ink-3 dark:text-white/60">No active project selected.</p>
        {projects.length > 0 ? (
          <label className="block">
            <span className="sr-only">Choose a project</span>
            <select
              value=""
              onChange={e => e.target.value && setActiveProject(e.target.value)}
              aria-label="Choose Project"
              className="w-full text-xs rounded-lg border border-surface-5 dark:border-white/15 bg-white dark:bg-[#1c1c1e] dark:text-white px-2 py-1.5 cursor-pointer"
            >
              <option value="" disabled>Choose Project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-2xs text-ink-4 dark:text-white/40">
            No projects yet — open the extension icon to create one.
          </p>
        )}
      </section>
    )
  }

  return (
    <section aria-label="Current project" className="rounded-xl border border-surface-5/60 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Dot color={project.color} />
            <span className="text-micro text-ink-4 dark:text-white/40">CURRENT PROJECT</span>
          </div>
          <p className="text-md font-bold text-ink-1 dark:text-white truncate">{project.name}</p>
          <p className="text-2xs text-ink-4 dark:text-white/40 mt-0.5">
            {project.contextCount} capture{project.contextCount === 1 ? '' : 's'} · synced {formatRelative(project.lastActive)}
          </p>
        </div>
        {projects.length > 1 && (
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            aria-expanded={pickerOpen}
            className="shrink-0 text-2xs font-semibold text-accent hover:text-accent/80 transition-colors cursor-pointer"
          >
            Change
          </button>
        )}
      </div>

      {pickerOpen && (
        <select
          autoFocus
          value={project.id}
          onChange={e => { setActiveProject(e.target.value); setPickerOpen(false) }}
          aria-label="Switch project"
          className="w-full text-xs rounded-lg border border-surface-5 dark:border-white/15 bg-white dark:bg-[#1c1c1e] dark:text-white px-2 py-1.5 cursor-pointer"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}

      <button
        type="button"
        onClick={() => void capture()}
        disabled={!canCapture}
        className={cn(
          'w-full h-8 rounded-lg text-xs font-semibold transition-colors',
          status === 'success'
            ? 'bg-status-online/10 text-status-online border border-status-online/20'
            : canCapture
            ? 'bg-accent-muted text-accent border border-accent/20 hover:bg-accent/12 cursor-pointer'
            : 'bg-surface-2 dark:bg-white/5 text-ink-4 dark:text-white/40 border border-surface-5/70 dark:border-white/10 cursor-not-allowed',
        )}
      >
        {status === 'capturing' ? 'Capturing…' : status === 'success' ? 'Captured' : canCapture ? 'Capture Current Chat' : 'Open an AI tab first'}
      </button>
    </section>
  )
}
