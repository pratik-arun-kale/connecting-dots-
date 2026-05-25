export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  sessionsCount: number;
  contextsCount: number;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  source: 'chrome' | 'vscode' | 'manual';
  status: 'active' | 'completed' | 'archived';
  messagesCount: number;
  contextsCount: number;
  startedAt: string;
  endedAt: string | null;
  tags: string[];
}

export interface Context {
  id: string;
  sessionId: string;
  projectId: string;
  type: 'chat' | 'code' | 'note' | 'link' | 'image';
  title: string;
  content: string;
  metadata: Record<string, string>;
  tags: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
    source?: string;
  };
}

export interface SearchResult {
  id: string;
  type: 'project' | 'session' | 'context' | 'message';
  title: string;
  excerpt: string;
  matchedField: string;
  score: number;
  projectId?: string;
  sessionId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

// ──────────────────────────────────────────────
// Backend API types (snake_case matching FastAPI responses)
// ──────────────────────────────────────────────

export type Platform = 'chatgpt' | 'claude' | 'gemini';

export interface ApiProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type LinkStatus = 'pending' | 'linked' | 'unlinked' | 'failed';

export interface ApiSession {
  id: string;
  project_id: string;
  source_platform: Platform;
  title: string | null;
  tab_url: string | null;
  linked_url: string | null;
  link_status: LinkStatus;
  linked_at: string | null;
  created_at: string;
}

export interface ApiContext {
  id: string;
  session_id: string;
  raw_content: Record<string, unknown>;
  structured_content: Record<string, unknown> | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateProjectWithSessionsRequest {
  name: string;
  platforms: Platform[];
}

export interface CreateProjectWithSessionsResponse {
  project: ApiProject;
  sessions: ApiSession[];
}

export interface ApiContextListResponse {
  items: ApiContext[];
  total: number;
}

// ──────────────────────────────────────────────
// Extension message types
// ──────────────────────────────────────────────

export interface OpenProjectSessionsPayload {
  projectId: string;
  sessions: Array<{
    sessionId: string;
    platform: Platform;
  }>;
}

export interface ExtensionMessage {
  type: 'OPEN_PROJECT_SESSIONS';
  payload: OpenProjectSessionsPayload;
}
