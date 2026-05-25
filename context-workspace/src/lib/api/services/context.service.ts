import { Context } from '@/types';
import { mockContexts } from '@/mock';
import apiClient from '../client';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const contextService = {
  async getContexts(filters?: { projectId?: string; sessionId?: string; type?: string }): Promise<Context[]> {
    // If backend is active:
    // const response = await apiClient.get<Context[]>('/contexts', { params: filters });
    // return response.data;

    await delay(300);
    let results = [...mockContexts];
    if (filters?.projectId) {
      results = results.filter((c) => c.projectId === filters.projectId);
    }
    if (filters?.sessionId) {
      results = results.filter((c) => c.sessionId === filters.sessionId);
    }
    if (filters?.type) {
      results = results.filter((c) => c.type === filters.type);
    }
    return results;
  },

  async getContext(id: string): Promise<Context> {
    // If backend is active:
    // const response = await apiClient.get<Context>(`/contexts/${id}`);
    // return response.data;

    await delay(200);
    const context = mockContexts.find((c) => c.id === id);
    if (!context) throw new Error('Context not found');
    return { ...context };
  },

  async createContext(data: Omit<Context, 'id' | 'createdAt'>): Promise<Context> {
    // If backend is active:
    // const response = await apiClient.post<Context>('/contexts', data);
    // return response.data;

    await delay(300);
    const newContext: Context = {
      ...data,
      id: `ctx-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    mockContexts.unshift(newContext);
    return newContext;
  },
};
