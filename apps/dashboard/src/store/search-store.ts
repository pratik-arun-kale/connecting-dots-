import { create } from 'zustand';

/** Whether the ⌘K palette is open. Its query and results live inside
 *  SearchDialog, which filters the already-loaded notes client-side. */
interface SearchState {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}));
