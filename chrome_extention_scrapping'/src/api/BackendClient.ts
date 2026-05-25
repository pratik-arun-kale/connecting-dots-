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

export class BackendClient {
  constructor(private readonly baseUrl: string = DEFAULT_BASE) {}

  async reportState(sessionId: string, state: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!res.ok) {
      throw new Error(`reportState(${state}) → ${res.status}: ${await res.text()}`);
    }
  }

  async linkSession(sessionId: string, url: string): Promise<BackendSession> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      throw new Error(`linkSession → ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<BackendSession>;
  }

  async failSession(sessionId: string, reason: string, detail?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/fail`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, ...(detail ? { detail } : {}) }),
    });
    if (!res.ok) {
      throw new Error(`failSession(${reason}) → ${res.status}: ${await res.text()}`);
    }
  }
}
