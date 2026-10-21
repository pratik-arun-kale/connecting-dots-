import type { ConversationSearchResponse } from '@/types';
import apiClient from '../client';

// Calls the backend's retrieval-only conversation search (BM25 + vector + reranker).
// Distinct from `searchService` (search.service.ts), which backs the unrelated,
// still-mocked ⌘K command-palette search.
export const conversationSearchService = {
  async searchConversations(
    projectId: string,
    query: string,
    topK = 10
  ): Promise<ConversationSearchResponse> {
    const response = await apiClient.post<ConversationSearchResponse>(
      '/search/conversations',
      { project_id: projectId, query, top_k: topK }
    );
    return response.data;
  },
};
