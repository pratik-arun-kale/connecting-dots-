import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  activeSection: string;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
  setActiveSection: (section: string) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  isCollapsed: false,
  activeSection: 'dashboard',
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  collapse: () => set({ isCollapsed: true }),
  expand: () => set({ isCollapsed: false }),
  setActiveSection: (section) => set({ activeSection: section }),
}));
