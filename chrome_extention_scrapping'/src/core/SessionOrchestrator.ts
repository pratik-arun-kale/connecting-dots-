import type { ProviderSession, SessionState, FailureReason } from '../types/session';
import { TERMINAL_STATES, STATE_TIMEOUTS } from '../types/session';
import type { EventBus } from './EventBus';
import type { TabManager } from './TabManager';
import type { SessionStore } from '../storage/SessionStore';
import type { BackendClient } from '../api/BackendClient';
import type { ProviderRegistry } from '../providers/ProviderRegistry';

class SessionTimeoutError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly reason: FailureReason,
  ) {
    super(`Session ${sessionId} timed out: ${reason}`);
  }
}

export class SessionOrchestrator {
  private readonly _inProgress = new Set<string>();
  private readonly _uiResolvers  = new Map<string, () => void>();
  private readonly _urlResolvers  = new Map<string, (url: string) => void>();
  private readonly _failRejecters = new Map<string, (err: SessionTimeoutError) => void>();

  constructor(
    private readonly bus:       EventBus,
    private readonly store:     SessionStore,
    private readonly tabs:      TabManager,
    private readonly api:       BackendClient,
    private readonly providers: ProviderRegistry,
  ) {
    this._wireEventBus();
  }

  private _wireEventBus(): void {
    this.bus.on('UI_READY', ({ sessionId }) => {
      this._uiResolvers.get(sessionId)?.();
      this._uiResolvers.delete(sessionId);
    });

    this.bus.on('URL_DETECTED', ({ sessionId, url }) => {
      this._urlResolvers.get(sessionId)?.(url);
      this._urlResolvers.delete(sessionId);
    });

    this.bus.on('SESSION_FAILED', ({ sessionId, reason }) => {
      this._failRejecters.get(sessionId)?.(new SessionTimeoutError(sessionId, reason));
      this._failRejecters.delete(sessionId);
    });
  }

  /** Called by background.ts to start a new session. */
  async start(session: ProviderSession): Promise<void> {
    await this.store.set(session);
    void this._drive(session.sessionId);
  }

  /** Called on SW startup to re-arm all non-terminal sessions. */
  async restore(): Promise<void> {
    await this.tabs.restore();
    const sessions = await this.store.getAll();
    for (const [sessionId, session] of sessions) {
      if (!TERMINAL_STATES.has(session.state)) {
        void this._drive(sessionId);
      }
    }
  }

  /** Called by the alarm handler for backup timeout enforcement. */
  async notifyAlarmTimeout(sessionId: string, reason: FailureReason): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;

    const rejecter = this._failRejecters.get(sessionId);
    if (rejecter) {
      rejecter(new SessionTimeoutError(sessionId, reason));
    } else {
      await this._failSession(sessionId, reason);
    }
  }

  /** Called when chrome.tabs.onRemoved fires for a tracked tab. */
  async notifyTabClosed(tabId: number): Promise<void> {
    const sessionId = this.tabs.unregister(tabId);
    if (!sessionId) return;

    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;

    const rejecter = this._failRejecters.get(sessionId);
    if (rejecter) {
      rejecter(new SessionTimeoutError(sessionId, 'tab_closed'));
    } else {
      await this._failSession(sessionId, 'tab_closed');
    }
  }

  private async _drive(sessionId: string): Promise<void> {
    if (this._inProgress.has(sessionId)) return;
    this._inProgress.add(sessionId);

    try {
      let s = await this.store.get(sessionId);
      if (!s || TERMINAL_STATES.has(s.state)) return;

      // ── Step 1: Create tab ────────────────────────────────────────────────
      if (s.state === 'pending' || (s.state === 'creating_tab' && s.tabId === null)) {
        s = await this._advance(sessionId, 'creating_tab');

        const provider = this.providers.get(s.platform);
        if (!provider) throw new SessionTimeoutError(sessionId, 'provider_error');

        const tab = await chrome.tabs.create({ url: provider.homeUrl, active: false });
        const tabId = tab.id!;
        this.tabs.register(tabId, sessionId);
        s = await this.store.update(sessionId, { tabId });
      }

      // ── Step 2: Wait for UI ───────────────────────────────────────────────
      if (s.state === 'creating_tab' || s.state === 'waiting_for_ui') {
        s = await this._advance(sessionId, 'waiting_for_ui');
        this._armAlarm(sessionId, 'waiting_for_ui');

        await this._waitForUiReady(sessionId, STATE_TIMEOUTS.waiting_for_ui ?? 45_000);

        this._clearAlarm(sessionId, 'waiting_for_ui');
        s = await this._advance(sessionId, 'injecting_bootstrap');
      }

      // ── Step 3: Inject bootstrap ──────────────────────────────────────────
      if (s.state === 'injecting_bootstrap') {
        this._armAlarm(sessionId, 'injecting_bootstrap');

        s = (await this.store.get(sessionId))!;
        if (s.bootstrapMessage && s.tabId !== null) {
          const provider = this.providers.get(s.platform);
          if (provider) {
            try {
              await provider.injectBootstrapMessage(s.tabId, s.bootstrapMessage);
            } catch {
              throw new SessionTimeoutError(sessionId, 'bootstrap_failed');
            }
          }
        }

        this._clearAlarm(sessionId, 'injecting_bootstrap');
        s = await this._advance(sessionId, 'waiting_for_url');
      }

      // ── Step 4: Wait for conversation URL ────────────────────────────────
      if (s.state === 'waiting_for_url') {
        this._armAlarm(sessionId, 'waiting_for_url');

        const url = await this._waitForUrl(sessionId, STATE_TIMEOUTS.waiting_for_url ?? 90_000);

        this._clearAlarm(sessionId, 'waiting_for_url');
        s = await this._advance(sessionId, 'linking');

        // ── Step 5: Link URL ────────────────────────────────────────────────
        this._armAlarm(sessionId, 'linking');
        await this.api.linkSession(sessionId, url);
        this._clearAlarm(sessionId, 'linking');

        // Backend sets state → completed; mirror locally then clean up
        await this.store.update(sessionId, { state: 'completed', linkedUrl: url });
        await this.store.remove(sessionId);
        this._cleanup(sessionId);
      }

    } catch (err) {
      const reason: FailureReason =
        err instanceof SessionTimeoutError ? err.reason : 'backend_error';
      await this._failSession(sessionId, reason);
    } finally {
      this._inProgress.delete(sessionId);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _advance(sessionId: string, state: SessionState): Promise<ProviderSession> {
    await this.api.reportState(sessionId, state);
    return this.store.update(sessionId, { state });
  }

  private _waitForUiReady(sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._uiResolvers.delete(sessionId);
        this._failRejecters.delete(sessionId);
        reject(new SessionTimeoutError(sessionId, 'ui_timeout'));
      }, timeoutMs);

      this._uiResolvers.set(sessionId, () => {
        clearTimeout(timer);
        this._failRejecters.delete(sessionId);
        resolve();
      });
      this._failRejecters.set(sessionId, (err) => {
        clearTimeout(timer);
        this._uiResolvers.delete(sessionId);
        reject(err);
      });
    });
  }

  private _waitForUrl(sessionId: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._urlResolvers.delete(sessionId);
        this._failRejecters.delete(sessionId);
        reject(new SessionTimeoutError(sessionId, 'url_timeout'));
      }, timeoutMs);

      this._urlResolvers.set(sessionId, (url: string) => {
        clearTimeout(timer);
        this._failRejecters.delete(sessionId);
        resolve(url);
      });
      this._failRejecters.set(sessionId, (err) => {
        clearTimeout(timer);
        this._urlResolvers.delete(sessionId);
        reject(err);
      });
    });
  }

  private async _failSession(sessionId: string, reason: FailureReason): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session || TERMINAL_STATES.has(session.state)) return;

    try {
      await this.api.failSession(sessionId, reason);
    } catch { /* best-effort — don't throw on cleanup */ }

    await this.store.update(sessionId, { state: 'failed' });
    await this.store.remove(sessionId);
    this._cleanup(sessionId);
    if (session.tabId !== null) this.tabs.unregister(session.tabId);
  }

  private _armAlarm(sessionId: string, state: SessionState): void {
    const ms = STATE_TIMEOUTS[state];
    if (!ms) return;
    // Backup alarm fires at 2× timeout (Chrome minimum is 30 s for loaded extensions)
    const delayMinutes = Math.max(0.5, (ms * 2) / 60_000);
    chrome.alarms.create(`timeout:${sessionId}:${state}`, { delayInMinutes: delayMinutes });
  }

  private _clearAlarm(sessionId: string, state: SessionState): void {
    void chrome.alarms.clear(`timeout:${sessionId}:${state}`);
  }

  private _cleanup(sessionId: string): void {
    this._uiResolvers.delete(sessionId);
    this._urlResolvers.delete(sessionId);
    this._failRejecters.delete(sessionId);
    const states: SessionState[] = [
      'creating_tab', 'waiting_for_ui', 'injecting_bootstrap', 'waiting_for_url', 'linking',
    ];
    for (const state of states) {
      void chrome.alarms.clear(`timeout:${sessionId}:${state}`);
    }
  }
}
