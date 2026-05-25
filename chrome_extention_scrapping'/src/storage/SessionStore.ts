import type { ProviderSession } from '../types/session';

const KEY = 'active_sessions';

export class SessionStore {
  async getAll(): Promise<Map<string, ProviderSession>> {
    const data = await chrome.storage.local.get(KEY);
    const raw = data[KEY] as Record<string, ProviderSession> | undefined;
    return new Map(Object.entries(raw ?? {}));
  }

  async get(sessionId: string): Promise<ProviderSession | undefined> {
    const all = await this.getAll();
    return all.get(sessionId);
  }

  async set(session: ProviderSession): Promise<void> {
    const all = await this.getAll();
    all.set(session.sessionId, session);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
  }

  async update(sessionId: string, patch: Partial<ProviderSession>): Promise<ProviderSession> {
    const all = await this.getAll();
    const existing = all.get(sessionId);
    if (!existing) throw new Error(`Session ${sessionId} not in store`);
    const updated: ProviderSession = { ...existing, ...patch };
    all.set(sessionId, updated);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
    return updated;
  }

  async remove(sessionId: string): Promise<void> {
    const all = await this.getAll();
    all.delete(sessionId);
    await chrome.storage.local.set({ [KEY]: Object.fromEntries(all) });
  }
}
