export type SessionState =
  | 'pending'
  | 'creating_tab'
  | 'waiting_for_ui'
  | 'injecting_bootstrap'
  | 'waiting_for_url'
  | 'linking'
  | 'completed'
  | 'failed';

export type SourcePlatform = 'chatgpt' | 'claude' | 'gemini' | 'unknown';

export type FailureReason =
  | 'auth_required'
  | 'ui_timeout'
  | 'bootstrap_failed'
  | 'url_timeout'
  | 'link_conflict'
  | 'backend_error'
  | 'tab_closed'
  | 'provider_error';

export interface ProviderSession {
  sessionId: string;
  projectId: string;
  platform: SourcePlatform;
  bootstrapMessage: string | null;
  state: SessionState;
  tabId: number | null;
  linkedUrl: string | null;
  createdAt: number;
}

// In-SW setTimeout values (ms). Chrome alarm backup uses 2× these.
export const STATE_TIMEOUTS: Partial<Record<SessionState, number>> = {
  creating_tab:        10_000,
  waiting_for_ui:      45_000,
  injecting_bootstrap: 15_000,
  waiting_for_url:     90_000,
  linking:             15_000,
};

export const TERMINAL_STATES: ReadonlySet<SessionState> = new Set(['completed', 'failed']);
