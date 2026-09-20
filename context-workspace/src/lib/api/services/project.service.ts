import type {
  ApiContext,
  ApiContextListResponse,
  ApiProject,
  CreateProjectWithSessionsRequest,
  CreateProjectWithSessionsResponse,
  Project,
  RagQueryResponse,
} from '@/types';
import { mockProjects } from '@/mock';
import apiClient from '../client';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Maps a backend ApiProject to the frontend Project shape expected by existing components.
function toFrontendProject(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    color: '#6366f1',
    sessionsCount: 0,
    contextsCount: 0,
    lastActiveAt: p.updated_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    const response = await apiClient.get<{ items: ApiProject[]; total: number }>('/projects');
    return response.data.items.map(toFrontendProject);
  },

  async getProject(id: string): Promise<Project> {
    const response = await apiClient.get<ApiProject>(`/projects/${id}`);
    return toFrontendProject(response.data);
  },

  // Legacy mock-backed create — kept for backward compatibility with useCreateProject hook.
  async createProject(
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'lastActiveAt' | 'sessionsCount' | 'contextsCount'>
  ): Promise<Project> {
    await delay(400);
    const newProject: Project = {
      ...data,
      id: `proj-${Date.now()}`,
      sessionsCount: 0,
      contextsCount: 0,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockProjects.push(newProject);
    return newProject;
  },

  // New flow: create project + sessions in one call (backed by real backend).
  async createProjectWithSessions(
    data: CreateProjectWithSessionsRequest
  ): Promise<CreateProjectWithSessionsResponse> {
    console.log('[DEBUG] createProjectWithSessions → payload:', data);
    console.log('[DEBUG] createProjectWithSessions → url:', apiClient.defaults.baseURL + '/projects/create-with-sessions');
    try {
      const response = await apiClient.post<CreateProjectWithSessionsResponse>(
        '/projects/create-with-sessions',
        data
      );
      console.log('[DEBUG] createProjectWithSessions → response status:', response.status);
      console.log('[DEBUG] createProjectWithSessions → response data:', response.data);
      return response.data;
    } catch (err: unknown) {
      console.error('[DEBUG] createProjectWithSessions → ERROR:', err);
      throw err;
    }
  },

  async getProjectContexts(projectId: string): Promise<ApiContext[]> {
    const response = await apiClient.get<ApiContextListResponse>(
      `/projects/${projectId}/contexts`
    );
    return response.data.items;
  },

  async updateProject(id: string, data: { name?: string; description?: string }): Promise<Project> {
    const response = await apiClient.patch<ApiProject>(`/projects/${id}`, data);
    return toFrontendProject(response.data);
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/projects/${id}`);
  },

  async queryProject(projectId: string, question: string): Promise<RagQueryResponse> {
    const response = await apiClient.post<RagQueryResponse>(
      `/projects/${projectId}/query`,
      { question },
      { timeout: 120_000 },
    );
    return response.data;
  },

  // The dashboard's Notes composer goes through the SAME capture pipeline as
  // the extension (POST /projects/{id}/capture, platform "note") — not
  // localStorage — so these notes sync, are searchable, and get embedded
  // exactly like extension-captured notes. There's no source page for a
  // dashboard-authored note, so chat_url is left empty (the schema allows
  // an empty string; getSourceChip() in lib/context-platform.ts falls back
  // to a plain "Note" label with no link when chat_url is empty).
  async createNote(projectId: string, text: string): Promise<{ contextId: string }> {
    const trimmed = text.trim();
    const idempotencyKey =
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `note_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const response = await apiClient.post<{ context_id: string }>(`/projects/${projectId}/capture`, {
      idempotency_key: idempotencyKey,
      platform: 'note',
      chat_url: '',
      captured_at: new Date().toISOString(),
      title: `[Note] ${trimmed.slice(0, 80)}`,
      messages: [{ role: 'user', content: trimmed, timestamp: new Date().toISOString(), index: 0 }],
      metadata: { source: 'dashboard-note' },
      kind: 'written',
      page_title: 'Dashboard',
    });
    return { contextId: response.data.context_id };
  },

  // Debounced autosave (see NoteComposer in notes-feed.tsx) PATCHes the same
  // note's content_md as the user keeps typing, rather than creating a new
  // context per keystroke-pause.
  async updateNoteContent(contextId: string, contentMd: string): Promise<void> {
    await apiClient.patch(`/contexts/detail/${contextId}`, { content_md: contentMd });
  },

  async updateNoteAnnotation(contextId: string, userNote: string | null): Promise<void> {
    await apiClient.patch(`/contexts/detail/${contextId}`, { user_note: userNote });
  },

  async deleteNote(contextId: string): Promise<void> {
    await apiClient.delete(`/contexts/detail/${contextId}`);
  },
};
