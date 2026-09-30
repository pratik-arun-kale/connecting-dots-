import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceState {
  /** The sidebar's project filter; null = all notes across projects. */
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProject: (id) => set({ activeProjectId: id }),
    }),
    { name: 'cw-workspace' },
  ),
);
