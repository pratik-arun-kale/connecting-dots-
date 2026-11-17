import { authorizedFetch } from '@/auth/authorizedFetch';
import { API_BASE_URL } from '@/config';

export interface BackendSession {
  id: string;
  project_id: string;
  source_platform: string;
  session_state: string;
  bootstrap_message: string | null;
  linked_url: string | null;
  link_status: string;
  linked_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  attempt: number;
  created_at: string;
}

export interface CapturePayload {
  idempotency_key: string;
  platform:        string;
  chat_url:        string;
  captured_at:     string;
  title:           string;
  messages:        Array<{ role: string; content: string; timestamp: string | null; index: number }>;
  metadata:        Record<string, unknown> | null;
  // Notebook fields (0008) — optional so full-conversation captures (which
  // don't set these) keep compiling unchanged.
  kind?:        'captured' | 'written';
  page_title?:  string | null;
  prompt_text?: string | null;
}

export interface CaptureResponse {
  context_id:     string;
  session_id:     string;
  title:          string;
  messages_count: number;
  platform:       string;
  chat_url:       string;
  captured_at:    string;
  created:        boolean;
}

export interface ProjectSummary {
  id:   string;
  name: string;
}

/**
 * A capture the API refused. `duplicateOf` is set for 409 `duplicate`: the
 * same passage/conversation is already saved in that project, as that note.
 * `permanent` means retrying the same request can't succeed (other 4xx,
 * except 401 — the user may sign in again — 408 and 429).
 */
export class CaptureRejectedError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly duplicateOf: string | null;

  constructor(status: number, code: string | null, message: string, duplicateOf: string | null) {
    super(message);
    this.name = 'CaptureRejectedError';
    this.status = status;
    this.code = code;
    this.duplicateOf = duplicateOf;
  }

  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && ![401, 408, 429].includes(this.status);
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { context_id?: string } | null };
}

export class BackendClient {
  constructor(private readonly baseUrl: string = API_BASE_URL) {}

  async reportState(sessionId: string, state: string): Promise<void> {
    const res = await authorizedFetch(this.baseUrl, `/sessions/${sessionId}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    });
    if (!res.ok) {
      throw new Error(`reportState(${state}) → ${res.status}: ${await res.text()}`);
    }
  }

  async linkSession(sessionId: string, url: string): Promise<BackendSession> {
    const res = await authorizedFetch(this.baseUrl, `/sessions/${sessionId}/link`, {
      method: 'PATCH',
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      throw new Error(`linkSession → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<BackendSession>;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const res = await authorizedFetch(this.baseUrl, '/projects');
    if (!res.ok) {
      throw new Error(`listProjects → ${res.status}: ${await res.text()}`);
    }
    // Backend returns { items, total } — unwrap .items (see src/lib/api.ts for the same fix).
    const body = (await res.json()) as { items: ProjectSummary[] };
    return body.items;
  }

  async captureConversation(projectId: string, payload: CapturePayload): Promise<CaptureResponse> {
    const res = await authorizedFetch(this.baseUrl, `/projects/${projectId}/capture`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let body: ApiErrorBody = {};
      try { body = JSON.parse(text) as ApiErrorBody; } catch { /* not JSON */ }
      const code = body.error?.code ?? null;
      const duplicateOf = code === 'duplicate' ? body.error?.details?.context_id ?? null : null;
      throw new CaptureRejectedError(
        res.status,
        code,
        body.error?.message ?? `captureConversation → ${res.status}: ${text.slice(0, 200)}`,
        duplicateOf,
      );
    }
    return res.json() as Promise<CaptureResponse>;
  }

  async failSession(sessionId: string, reason: string, detail?: string): Promise<void> {
    const res = await authorizedFetch(this.baseUrl, `/sessions/${sessionId}/fail`, {
      method: 'PATCH',
      body: JSON.stringify({ reason, ...(detail ? { detail } : {}) }),
    });
    if (!res.ok) {
      throw new Error(`failSession(${reason}) → ${res.status}: ${await res.text()}`);
    }
  }
}
