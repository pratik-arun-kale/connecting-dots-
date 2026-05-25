/**
 * TabRegistry — tracks which tabs are linked to which sessions.
 *
 * Persisted to chrome.storage.local so the mapping survives service worker
 * termination. An in-memory cache is kept for same-SW-lifetime reads.
 */

const STORAGE_KEY = 'tabRegistry';

export interface TabEntry {
  tabId: number;
  sessionId: string;
  projectId: string;
  platform: string;
  linkedUrl: string | null;   // null until the user navigates to a conversation
  syncStatus: 'pending' | 'synced' | 'failed';
}

type RegistryMap = Record<string, TabEntry>; // key = String(tabId)

let _cache: RegistryMap | null = null;

async function load(): Promise<RegistryMap> {
  if (_cache !== null) return _cache;
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      _cache = (result[STORAGE_KEY] as RegistryMap) ?? {};
      resolve(_cache);
    });
  });
}

async function persist(map: RegistryMap): Promise<void> {
  _cache = map;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: map }, resolve);
  });
}

export const TabRegistry = {
  async set(entry: TabEntry): Promise<void> {
    const map = await load();
    map[String(entry.tabId)] = entry;
    await persist(map);
  },

  async get(tabId: number): Promise<TabEntry | null> {
    const map = await load();
    return map[String(tabId)] ?? null;
  },

  async update(tabId: number, patch: Partial<Omit<TabEntry, 'tabId'>>): Promise<void> {
    const map = await load();
    const entry = map[String(tabId)];
    if (!entry) return;
    map[String(tabId)] = { ...entry, ...patch };
    await persist(map);
  },

  async remove(tabId: number): Promise<void> {
    const map = await load();
    delete map[String(tabId)];
    await persist(map);
  },

  async getAll(): Promise<TabEntry[]> {
    const map = await load();
    return Object.values(map);
  },

  /** Must be called when the SW restarts to re-warm the cache. */
  async restore(): Promise<void> {
    _cache = null;
    await load();
  },
};
