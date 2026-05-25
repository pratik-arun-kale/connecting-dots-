import { create } from 'zustand';
import type { SearchResult } from '@/types';

interface SearchState {
  query: string;
  isOpen: boolean;
  results: SearchResult[];
  isLoading: boolean;
  setQuery: (query: string) => void;
  setOpen: (isOpen: boolean) => void;
  setResults: (results: SearchResult[]) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  isOpen: false,
  results: [],
  isLoading: false,
  setQuery: (query) => set({ query }),
  setOpen: (isOpen) => set({ isOpen }),
  setResults: (results) => set({ results }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ query: '', isOpen: false, results: [], isLoading: false }),
}));
