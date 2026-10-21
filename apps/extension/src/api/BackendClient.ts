import { authorizedFetch } from '@/auth/authorizedFetch';

const DEFAULT_BASE = 'http://localhost:8000/api/v1';

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

export class BackendClient {
  constructor(private readonly baseUrl: string = DEFAULT_BASE) {}

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
      const body = await res.text().catch(() => '');
      throw new Error(`captureConversation → ${res.status}: ${body.slice(0, 200)}`);
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
