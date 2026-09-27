import { create } from 'zustand';

interface WorkspaceState {
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  setActiveProject: (id) => set({ activeProjectId: id }),
}));
