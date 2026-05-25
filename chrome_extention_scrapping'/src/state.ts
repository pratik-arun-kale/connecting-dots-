/** Typed wrapper around chrome.storage.local for workspace state. */

const KEY = 'workspaceState';

export interface WorkspaceState {
  activeProject: { id: string; name: string } | null;
  sessions: Array<{ id: string; source_platform: string }>;
  tabMappings: Record<string, { sessionId: string; projectId: string; platform: string; url: string }>;
  captureHistory: Array<{ sessionId: string; platform: string; url: string; timestamp: string; messageCount: number }>;
}

const DEFAULT: WorkspaceState = {
  activeProject: null,
  sessions: [],
  tabMappings: {},
  captureHistory: [],
};

export const store = {
  async get(): Promise<WorkspaceState> {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEY, (result) => {
        resolve({ ...DEFAULT, ...(result[KEY] as Partial<WorkspaceState> | undefined) });
      });
    });
  },

  async set(updates: Partial<WorkspaceState>): Promise<WorkspaceState> {
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

  async clear(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: { ...DEFAULT } }, resolve);
    });
  },
};
