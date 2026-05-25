/**
 * store/state.js — Extension workspace state management
 * =======================================================
 * Thin wrapper around chrome.storage.local providing typed get/set/clear.
 *
 * State shape:
 *   activeProject   — currently active project { id, name }
 *   sessions        — sessions for the active project [{ id, source_platform }]
 *   tabMappings     — { [tabId]: { sessionId, projectId, platform, url } }
 *   captureHistory  — recent saves [{ sessionId, platform, url, timestamp, messageCount }]
 */

const KEY = 'workspaceState';

const DEFAULT = {
  /** @type {{ id: string, name: string } | null} */
  activeProject: null,
  /** @type {Array<{ id: string, source_platform: string }>} */
  sessions: [],
  /** @type {Record<string, { sessionId: string, projectId: string, platform: string, url: string }>} */
  tabMappings: {},
  /** @type {Array<{ sessionId: string, platform: string, url: string, timestamp: string, messageCount: number }>} */
  captureHistory: [],
};

export const store = {
  /** @returns {Promise<typeof DEFAULT>} */
  async get() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEY, (result) => {
        resolve({ ...DEFAULT, ...(result[KEY] || {}) });
      });
    });
  },

  /**
   * Merge updates into the current state.
   * @param {Partial<typeof DEFAULT>} updates
   * @returns {Promise<typeof DEFAULT>}
   */
  async set(updates) {
    const current = await this.get();
    const next = { ...current, ...updates };
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [KEY]: next }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(next);
        }
      });
    });
  },

  /** Reset state to defaults. Does not affect backend data. */
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: { ...DEFAULT } }, resolve);
    });
  },
};
