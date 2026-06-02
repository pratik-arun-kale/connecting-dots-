import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { GlassCard } from '../ui/GlassCard'
import { Dot } from '../ui/Dot'
import { fadeUp } from '@/lib/motion'
import { formatRelative, cn } from '@/lib/utils'
import type { Project } from '@/types/project'

interface ProjectCardProps {
  project: Project
  onDelete?: (id: string) => void
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const { activeProjectId, setActiveProject, setActiveTab } = useWorkspaceStore()
  const isActive = activeProjectId === project.id

  const handleSelect = () => {
    setActiveProject(project.id)
    setActiveTab('workspace')
  }

  return (
    <motion.div variants={fadeUp}>
      <GlassCard
        className={cn(
          isActive && 'border-accent/30 bg-accent/5 shadow-glow-sm',
        )}
        onClick={handleSelect}
      >
        <div className="flex items-center gap-3">
          {/* Color swatch */}
          <div
            className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: project.color + '22', color: project.color }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink-1 truncate">{project.name}</p>
              {isActive && (
                <span className="shrink-0 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                  Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-4">
              <span>{project.contextCount} captures</span>
              <span>·</span>
              <span>{formatRelative(project.lastActive)}</span>
            </div>
          </div>

          {/* Delete */}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
              className="shrink-0 p-1 rounded-md text-ink-4 hover:text-status-offline hover:bg-status-offline/10 opacity-0 group-hover:opacity-100 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}
