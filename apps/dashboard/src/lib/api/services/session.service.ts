import type { ApiSession } from '@/types';
import apiClient from '../client';

export const sessionService = {
  /** Sessions for a project, from the backend. */
  async getProjectSessions(projectId: string): Promise<ApiSession[]> {
    const response = await apiClient.get<{ items: ApiSession[]; total: number }>(
      `/sessions/${projectId}`
    );
    return response.data.items;
  },
};
