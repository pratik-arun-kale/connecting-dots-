import type {
  ApiContext,
  ApiContextListResponse,
  ApiProject,
  CreateProjectWithSessionsRequest,
  CreateProjectWithSessionsResponse,
  Project,
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

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    await delay(300);
    const index = mockProjects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Project not found');
    mockProjects[index] = { ...mockProjects[index], ...data, updatedAt: new Date().toISOString() };
    return mockProjects[index];
  },

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/projects/${id}`);
  },
};
