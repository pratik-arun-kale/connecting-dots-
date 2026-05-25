/**
 * services/api.js — Extension backend API client
 * ================================================
 * Direct fetch-based client for the Context Workspace backend.
 * Used by the background service worker and popup.
 * Content scripts call the backend directly (they cannot import modules).
 */

const API_BASE = 'http://localhost:8000/api/v1';

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function fetchJSON(url, init = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  /**
   * Check backend reachability. Returns true if healthy, false otherwise.
   * @returns {Promise<boolean>}
   */
  async health() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * @param {string} id
   * @returns {Promise<{ id: string, name: string, description: string }>}
   */
  getProject: (id) => fetchJSON(`${API_BASE}/projects/${id}`),

  /**
   * @param {{ session_id: string, platform: string, url: string, raw_content: object }} payload
   * @returns {Promise<any>}
   */
  captureContext: (payload) =>
    fetchJSON(`${API_BASE}/contexts/capture`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * @param {string} sessionId
   * @param {string} url
   * @returns {Promise<void>}
   */
  linkSession: (sessionId, url) =>
    fetchJSON(`${API_BASE}/sessions/${sessionId}/link`, {
      method: 'PATCH',
      body: JSON.stringify({ url }),
    }),
};
