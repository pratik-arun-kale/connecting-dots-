import { env } from "@/lib/env";

// ──────────────────────────────────────────────
// Application Constants
// ──────────────────────────────────────────────

export const APP_NAME = "Context Workspace" as const;

// Includes the /api/v1 prefix, so service calls like `/projects/...` resolve
// correctly. Set NEXT_PUBLIC_API_BASE_URL in .env.local (see .env.example).
export const API_BASE_URL = env.apiBaseUrl;

/** Default stale time for TanStack Query (5 minutes). */
export const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// ──────────────────────────────────────────────
// TanStack Query Keys
// ──────────────────────────────────────────────

export const QUERY_KEYS = {
  projects: "projects",
  sessions: "sessions",
  contexts: "contexts",
  notes: "notes",
  messages: "messages",
  search: "search",
  trash: "trash",
} as const;
