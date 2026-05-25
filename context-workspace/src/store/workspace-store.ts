import { create } from 'zustand';

interface WorkspaceState {
  activeProjectId: string | null;
  syncStatus: 'synced' | 'syncing' | 'offline';
  setActiveProject: (id: string | null) => void;
  setSyncStatus: (status: 'synced' | 'syncing' | 'offline') => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  syncStatus: 'synced',
  setActiveProject: (id) => set({ activeProjectId: id }),
  setSyncStatus: (status) => set({ syncStatus: status }),
}));
