// ──────────────────────────────────────────────
// Application Constants
// ──────────────────────────────────────────────

export const APP_NAME = "Context Workspace" as const;

// Include /api/v1 in the default so service calls like `/projects/...` resolve correctly.
// Override via NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 in .env.local if needed.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

/** Default stale time for TanStack Query (5 minutes). */
export const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// ──────────────────────────────────────────────
// TanStack Query Keys
// ──────────────────────────────────────────────

export const QUERY_KEYS = {
  projects: "projects",
  sessions: "sessions",
  contexts: "contexts",
  messages: "messages",
  search: "search",
} as const;

// ──────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Projects", href: "/projects", icon: "FolderKanban" },
  { label: "Sessions", href: "/sessions", icon: "MessageSquare" },
  { label: "Saved Contexts", href: "/contexts", icon: "Bookmark" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

// ──────────────────────────────────────────────
// Sync Status
// ──────────────────────────────────────────────

export type SyncStatus = "connected" | "syncing" | "disconnected" | "error";

export const SYNC_STATUS: Record<SyncStatus, SyncStatus> = {
  connected: "connected",
  syncing: "syncing",
  disconnected: "disconnected",
  error: "error",
} as const;
