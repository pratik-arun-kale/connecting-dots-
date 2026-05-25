import { Session, ChatMessage, ApiSession } from '@/types';
import { mockSessions, mockChatMessages } from '@/mock';
import apiClient from '../client';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const sessionService = {
  async getSessions(projectId?: string): Promise<Session[]> {
    // If backend is active:
    // const response = await apiClient.get<Session[]>('/sessions', { params: { projectId } });
    // return response.data;

    await delay(300);
    if (projectId) {
      return mockSessions.filter((s) => s.projectId === projectId);
    }
    return [...mockSessions];
  },

  async getSession(id: string): Promise<Session> {
    // If backend is active:
    // const response = await apiClient.get<Session>(`/sessions/${id}`);
    // return response.data;

    await delay(200);
    const session = mockSessions.find((s) => s.id === id);
    if (!session) throw new Error('Session not found');
    return { ...session };
  },

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    // If backend is active:
    // const response = await apiClient.get<ChatMessage[]>(`/sessions/${sessionId}/messages`);
    // return response.data;

    await delay(300);
    return mockChatMessages.filter((m) => m.sessionId === sessionId);
  },

  /** Fetch sessions for a project from the real backend. Returns ApiSession[]. */
  async getProjectSessions(projectId: string): Promise<ApiSession[]> {
    const response = await apiClient.get<{ items: ApiSession[]; total: number }>(
      `/sessions/${projectId}`
    );
    return response.data.items;
  },

  async createSession(data: Omit<Session, 'id' | 'startedAt' | 'endedAt' | 'messagesCount' | 'contextsCount'>): Promise<Session> {
    // If backend is active:
    // const response = await apiClient.post<Session>('/sessions', data);
    // return response.data;

    await delay(400);
    const newSession: Session = {
      ...data,
      id: `sess-${Date.now()}`,
      messagesCount: 0,
      contextsCount: 0,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    mockSessions.unshift(newSession);
    return newSession;
  },
};
