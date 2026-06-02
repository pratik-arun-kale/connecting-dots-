import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { chromeStorage } from './storage'
import type { Project } from '../types/project'
import type { Platform, PlatformId } from '../types/platform'
import type { Context } from '../types/context'
import { makePlatform } from '../types/platform'

export type ActiveTab = 'workspace' | 'projects' | 'platforms'

interface WorkspaceState {
  // Runtime (not persisted)
  backendOnline:  boolean
  syncing:        boolean
  lastSyncAt:     number | null
  syncError:      string | null
  projectsTotal:  number
  platforms:      Record<PlatformId, Platform>
  contexts:       Context[]

  // Persisted
  activeProjectId: string | null
  projects:        Project[]
  activeTab:       ActiveTab

  // Actions
  setBackendOnline: (v: boolean) => void
  setSyncing:       (v: boolean) => void
  setLastSyncAt:    (ts: number) => void
  setSyncError:     (err: string | null) => void
  setProjectsTotal: (n: number) => void
  setActiveProject: (id: string | null) => void
  setActiveTab:     (tab: ActiveTab) => void
  setProjects:      (projects: Project[]) => void
  addProject:       (p: Project) => void
  removeProject:    (id: string) => void
  setContexts:      (contexts: Context[]) => void
  updatePlatform:   (id: PlatformId, patch: Partial<Platform>) => void
  resetPlatforms:   () => void
}

const defaultPlatforms = (): Record<PlatformId, Platform> => ({
  chatgpt:    makePlatform('chatgpt'),
  claude:     makePlatform('claude'),
  gemini:     makePlatform('gemini'),
  perplexity: makePlatform('perplexity'),
})

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      backendOnline:   false,
      syncing:         false,
      lastSyncAt:      null,
      syncError:       null,
      projectsTotal:   0,
      platforms:       defaultPlatforms(),
      contexts:        [],
      activeProjectId: null,
      projects:        [],
      activeTab:       'workspace',

      setBackendOnline: (v)   => set({ backendOnline: v }),
      setSyncing:       (v)   => set({ syncing: v }),
      setLastSyncAt:    (ts)  => set({ lastSyncAt: ts }),
      setSyncError:     (err) => set({ syncError: err }),
      setProjectsTotal: (n)   => set({ projectsTotal: n }),
      setActiveProject: (id)  => set({ activeProjectId: id }),
      setActiveTab:     (tab)      => set({ activeTab: tab }),
      setProjects:      (projects) => set({ projects }),
      addProject:       (p)        => set(s => ({ projects: [p, ...s.projects] })),
      removeProject:    (id)       => set(s => ({
        projects:        s.projects.filter(p => p.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      })),
      setContexts:      (contexts) => set({ contexts }),
      updatePlatform:   (id, patch) =>
        set(s => ({ platforms: { ...s.platforms, [id]: { ...s.platforms[id], ...patch } } })),
      resetPlatforms: () => set({ platforms: defaultPlatforms() }),
    }),
    {
      name:    'cw_workspace_v3',
      storage: createJSONStorage(() => chromeStorage),
      partialize: (s) => ({
        activeProjectId: s.activeProjectId,
        projects:        s.projects,
        activeTab:       s.activeTab,
      }),
    },
  ),
)
