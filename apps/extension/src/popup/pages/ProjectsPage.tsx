import { useState } from 'react'
import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { ProjectCard } from '../components/project/ProjectCard'
import { CreateProjectModal } from '../components/project/CreateProjectModal'
import { SearchInput } from '../components/ui/SearchInput'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { ScrollArea } from '../components/layout/PopupShell'
import { stagger, fadeUp } from '@/lib/motion'
import { api } from '@/lib/api'
import { normalizeProject, type ApiProject } from '@/types/project'
import { useProjects } from '../hooks/useProjects'

export function ProjectsPage() {
  const { projects, addProject, removeProject } = useWorkspaceStore()
  const syncing              = useWorkspaceStore(s => s.syncing)
  const loading              = syncing && projects.length === 0   // skeleton only on first load
  const [query, setQuery]    = useState('')
  const [modal, setModal]    = useState(false)

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  )

  const handleCreate = async (name: string) => {
    const raw     = await api.createProject(name)
    const project = normalizeProject(raw as ApiProject, projects.length)
    addProject(project)
  }

  const handleDelete = async (id: string) => {
    await api.deleteProject(id)
    removeProject(id)
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-micro text-ink-4">ALL PROJECTS</span>
          <Button size="sm" variant="surface" onClick={() => setModal(true)}>
            + New
          </Button>
        </div>
        {projects.length > 3 && (
          <SearchInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects…"
          />
        )}
      </div>

      <ScrollArea className="px-4 pb-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div variants={fadeUp} initial="hidden" animate="show"
            className="flex flex-col items-center py-10 text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-surface-5/70 flex items-center justify-center mb-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 5a2 2 0 012-2h2.586a1 1 0 01.707.293L8 4h4a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#ababab" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-ink-3 mb-1">{query ? 'No matches' : 'No projects yet'}</p>
            {!query && (
              <button onClick={() => setModal(true)} className="text-xs text-accent font-semibold hover:text-accent/80 transition-colors">
                Create your first project →
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </motion.div>
        )}
      </ScrollArea>

      <CreateProjectModal
        open={modal}
        onClose={() => setModal(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
