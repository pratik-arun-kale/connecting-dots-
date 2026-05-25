import type { SessionStore } from '../storage/SessionStore';

export class TabManager {
  private readonly _tabToSession = new Map<number, string>();
  private readonly _sessionToTab = new Map<string, number>();

  constructor(private readonly store: SessionStore) {}

  async restore(): Promise<void> {
    const sessions = await this.store.getAll();
    for (const [sessionId, session] of sessions) {
      if (session.tabId !== null) {
        this._tabToSession.set(session.tabId, sessionId);
        this._sessionToTab.set(sessionId, session.tabId);
      }
    }
  }

  register(tabId: number, sessionId: string): void {
    this._tabToSession.set(tabId, sessionId);
    this._sessionToTab.set(sessionId, tabId);
  }

  getSessionId(tabId: number): string | undefined {
    return this._tabToSession.get(tabId);
  }

  getTabId(sessionId: string): number | undefined {
    return this._sessionToTab.get(sessionId);
  }

  /** Removes the mapping and returns the sessionId that was registered for this tab. */
  unregister(tabId: number): string | undefined {
    const sessionId = this._tabToSession.get(tabId);
    if (sessionId !== undefined) {
      this._tabToSession.delete(tabId);
      this._sessionToTab.delete(sessionId);
    }
    return sessionId;
  }

  unregisterSession(sessionId: string): void {
    const tabId = this._sessionToTab.get(sessionId);
    if (tabId !== undefined) {
      this._tabToSession.delete(tabId);
      this._sessionToTab.delete(sessionId);
    }
  }
}
