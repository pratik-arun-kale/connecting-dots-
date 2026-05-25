'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { QUERY_KEYS, DEFAULT_STALE_TIME } from '@/lib/constants';
import { projectService, sessionService, contextService, searchService } from '@/lib/api/services';
import type { ApiContext, ApiSession, CreateProjectWithSessionsRequest, Project, Session, Context, ChatMessage } from '@/types';

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

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'lastActiveAt' | 'sessionsCount' | 'contextsCount'>) =>
      projectService.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects] });
    },
  });
}

export function useCreateProjectWithSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectWithSessionsRequest) =>
      projectService.createProjectWithSessions(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects] });
    },
  });
}

export function useProjectContexts(projectId: string) {
  return useQuery<ApiContext[]>({
    queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.contexts],
    queryFn: () => projectService.getProjectContexts(projectId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!projectId,
  });
}

// ──────────────────────────────────────────────
// Session Hooks
// ──────────────────────────────────────────────

export function useSessions(projectId?: string) {
  return useQuery({
    queryKey: projectId ? [QUERY_KEYS.sessions, { projectId }] : [QUERY_KEYS.sessions],
    queryFn: () => sessionService.getSessions(projectId),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useProjectSessions(projectId: string) {
  return useQuery<ApiSession[]>({
    queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.sessions],
    queryFn: () => sessionService.getProjectSessions(projectId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!projectId,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.sessions, id],
    queryFn: () => sessionService.getSession(id),
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!id,
  });
}

export function useSessionMessages(sessionId: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.sessions, sessionId, QUERY_KEYS.messages],
    queryFn: () => sessionService.getSessionMessages(sessionId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: !!sessionId,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Session, 'id' | 'startedAt' | 'endedAt' | 'messagesCount' | 'contextsCount'>) =>
      sessionService.createSession(data),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.sessions] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects, newSession.projectId, QUERY_KEYS.sessions] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects, newSession.projectId] });
    },
  });
}

// ──────────────────────────────────────────────
// Context Hooks
// ──────────────────────────────────────────────

export function useContexts(filters?: { projectId?: string; sessionId?: string; type?: string }) {
  return useQuery({
    queryKey: [QUERY_KEYS.contexts, filters],
    queryFn: () => contextService.getContexts(filters),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useCreateContext() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Context, 'id' | 'createdAt'>) =>
      contextService.createContext(data),
    onSuccess: (newContext) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.contexts] });
      if (newContext.sessionId) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.contexts, { sessionId: newContext.sessionId }] });
      }
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects, newContext.projectId] });
    },
  });
}

// ──────────────────────────────────────────────
// Search Hooks
// ──────────────────────────────────────────────

export function useSearchResults(query: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.search, query],
    queryFn: () => searchService.search(query),
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000, // Search results can become stale quicker
  });
}

// ──────────────────────────────────────────────
// Custom Hooks
// ──────────────────────────────────────────────

export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutId) clearTimeout(timeoutId);
      const id = setTimeout(() => callback(...args), delay);
      setTimeoutId(id);
    },
    [callback, delay, timeoutId]
  );
}
