import { SearchResult } from '@/types';
import { mockSearchResults } from '@/mock';
import apiClient from '../client';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const searchService = {
  async search(query: string): Promise<SearchResult[]> {
    // If backend is active:
    // const response = await apiClient.get<SearchResult[]>('/search', { params: { q: query } });
    // return response.data;

    await delay(300);
    if (!query.trim()) return [];
    
    const lower = query.toLowerCase();
    return mockSearchResults.filter(
      (r) =>
        r.title.toLowerCase().includes(lower) ||
        r.excerpt.toLowerCase().includes(lower)
    );
  },
};
