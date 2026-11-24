import apiClient from '../client';
import type { TrashResponse } from '@/types';

/** The Trash: deleting a note or project moves it here (see services/api trash routes). */
export const trashService = {
  async list(): Promise<TrashResponse> {
    const response = await apiClient.get<TrashResponse>('/trash');
    return response.data;
  },

  async restoreNote(id: string): Promise<{ id: string; project_id: string }> {
    const response = await apiClient.post<{ id: string; project_id: string }>(`/trash/notes/${id}/restore`);
    return response.data;
  },

  async restoreProject(id: string): Promise<void> {
    await apiClient.post(`/trash/projects/${id}/restore`);
  },

  async deleteNoteForever(id: string): Promise<void> {
    await apiClient.delete(`/trash/notes/${id}`);
  },

  async deleteProjectForever(id: string): Promise<void> {
    await apiClient.delete(`/trash/projects/${id}`);
  },
};
