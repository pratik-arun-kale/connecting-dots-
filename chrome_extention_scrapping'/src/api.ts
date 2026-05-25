/**
 * src/api.ts — Typed backend API client for the service worker.
 *
 * Popup uses services/api.js (plain JS, no build step needed).
 * This module is bundled into background.js by esbuild.
 */

const API_BASE = 'http://localhost:8000/api/v1';

async function fetchJSON<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async health(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  },

  getProject(id: string): Promise<{ id: string; name: string; description: string }> {
    return fetchJSON(`${API_BASE}/projects/${id}`);
  },

  captureContext(payload: {
    session_id: string;
    platform: string;
    url: string;
    raw_content: object;
  }): Promise<unknown> {
    return fetchJSON(`${API_BASE}/contexts/capture`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Bind a live conversation URL to a session (idempotent: same URL → 200).
   * Throws on HTTP 409 (different URL already linked) or other errors.
   */
  async linkSession(sessionId: string, url: string): Promise<void> {
    await fetchJSON(`${API_BASE}/sessions/${sessionId}/link`, {
      method: 'PATCH',
      body: JSON.stringify({ url }),
    });
  },
};
