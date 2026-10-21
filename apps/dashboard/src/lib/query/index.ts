'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS, DEFAULT_STALE_TIME } from '@/lib/constants';
import { projectService, sessionService, conversationSearchService } from '@/lib/api/services';
import type { ApiContext, ApiSession, ConversationSearchResponse, CreateProjectWithSessionsRequest, RagQueryResponse } from '@/types';

// ──────────────────────────────────────────────
// Project Hooks
// ──────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: [QUERY_KEYS.projects],
    queryFn: () => projectService.getProjects(),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.projects, id],
    queryFn: () => projectService.getProject(id),
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!id,
  });
}

export function useCreateProjectWithSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectWithSessionsRequest) =>
      projectService.createProjectWithSessions(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.projects, result.project.id, QUERY_KEYS.sessions],
      });

      // Tell the extension to drive each session through the FSM
      const extId = process.env.NEXT_PUBLIC_EXTENSION_ID;
      if (extId && typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any)?.chrome?.runtime;
        for (const session of result.sessions) {
          cr?.sendMessage(extId, {
            type: 'CREATE_PROVIDER_SESSION',
            sessionId: session.id,
            projectId: result.project.id,
            platform:  session.source_platform,
            bootstrapMessage: null,
          });
        }
      }
    },
  });
}

export function useProjectContexts(projectId: string) {
  return useQuery<ApiContext[]>({
    queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.contexts],
    queryFn: () => projectService.getProjectContexts(projectId),
    // staleTime: 0 so TanStack Query refetches on window focus.
    // When the user captures in the popup then switches back to the browser
    // the "Captured Context" tab will pick up the new rows automatically.
    staleTime: 0,
    enabled: !!projectId,
  });
}

/** Every note list (sidebar, Home, a project's contexts) and the single-note
 *  cache — refreshed after any note is created, edited or deleted. */
function invalidateNotes(queryClient: ReturnType<typeof useQueryClient>, projectId?: string) {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.notes] });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.contexts] });
  }
}

/** All the user's notes (projectId null) or one project's, recently edited first. */
export function useNotes(projectId: string | null) {
  return useQuery<ApiContext[]>({
    queryKey: [QUERY_KEYS.notes, 'list', projectId ?? 'all'],
    queryFn: () => projectService.listNotes(projectId),
    staleTime: 0,
  });
}

export function useNote(contextId: string | null) {
  return useQuery<ApiContext>({
    queryKey: [QUERY_KEYS.notes, 'detail', contextId],
    queryFn: () => projectService.getNote(contextId as string),
    enabled: !!contextId,
    staleTime: 0,
  });
}

export function useCreateNote(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => projectService.createNote(projectId, text),
    onSuccess: () => invalidateNotes(queryClient, projectId),
  });
}

export function useDeleteNote(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contextId: string) => projectService.deleteNote(contextId),
    onSuccess: (_data, contextId) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.notes, 'detail', contextId] });
      invalidateNotes(queryClient, projectId);
    },
  });
}

export function useUpdateNoteContent(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contextId, contentMd }: { contextId: string; contentMd: string }) =>
      projectService.updateNoteContent(contextId, contentMd),
    onSuccess: () => invalidateNotes(queryClient, projectId),
  });
}

export function useUpdateNoteTitle(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contextId, userTitle }: { contextId: string; userTitle: string }) =>
      projectService.updateNoteTitle(contextId, userTitle),
    onSuccess: () => invalidateNotes(queryClient, projectId),
  });
}

// ──────────────────────────────────────────────
// Session Hooks
// ──────────────────────────────────────────────

const TERMINAL_SESSION_STATES = new Set(['completed', 'failed']);

export function useProjectSessions(projectId: string) {
  return useQuery<ApiSession[]>({
    queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.sessions],
    queryFn: () => sessionService.getProjectSessions(projectId),
    staleTime: 0,
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!Array.isArray(data) || data.length === 0) return false;
      const hasActive = data.some((s) => !TERMINAL_SESSION_STATES.has(s.session_state));
      return hasActive ? 3_000 : false;
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) =>
      projectService.updateProject(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData([QUERY_KEYS.projects, updated.id], updated);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectService.deleteProject(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.projects, id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.notes] }); // its notes are gone too
    },
  });
}

// ──────────────────────────────────────────────
// RAG Query Hook
// ──────────────────────────────────────────────

export function useProjectQuery(projectId: string) {
  return useMutation<RagQueryResponse, Error, string>({
    mutationFn: (question: string) => projectService.queryProject(projectId, question),
  });
}

// ──────────────────────────────────────────────
// Conversation Search Hook (retrieval only, no LLM answer)
// ──────────────────────────────────────────────

export function useSearchConversations(projectId: string) {
  return useMutation<ConversationSearchResponse, Error, string>({
    mutationFn: (query: string) => conversationSearchService.searchConversations(projectId, query),
  });
}

