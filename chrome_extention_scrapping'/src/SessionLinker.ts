/**
 * SessionLinker — wires tab navigation events to backend session link calls.
 *
 * Called by webNavigation listeners in background.ts.
 * Uses TabRegistry to find the session for a tab and SyncQueue for retry
 * when the backend is temporarily unreachable.
 */

import { api } from './api.js';
import { ProviderRegistry } from './providers/index.js';
import { TabRegistry } from './TabRegistry.js';
import { SyncQueue } from './SyncQueue.js';

export const SessionLinker = {
  /**
   * Entry point for both SPA and full-page navigation events.
   * No-ops if the tab isn't tracked or the URL isn't a conversation.
   */
  async onTabUrlChange(tabId: number, url: string): Promise<void> {
    const provider = ProviderRegistry.forUrl(url);
    if (!provider?.isConversationUrl(url)) return;

    const entry = await TabRegistry.get(tabId);
    if (!entry) return;

    // Idempotent: same URL already confirmed → nothing to do.
    if (entry.linkedUrl === url && entry.syncStatus === 'synced') return;

    await _link(entry.sessionId, url, tabId);
  },

  /**
   * Process all due SyncQueue entries. Called by the alarm handler and on SW
   * install/update to flush any entries that survived SW termination.
   */
  async processSyncQueue(): Promise<void> {
    const due = await SyncQueue.due();
    if (due.length === 0) return;

    console.log('[SessionLinker] Processing', due.length, 'queued link(s)');
    for (const entry of due) {
      try {
        await api.linkSession(entry.sessionId, entry.url);
        await SyncQueue.remove(entry.sessionId);
        console.log('[SessionLinker] Retry succeeded:', entry.sessionId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('HTTP 409')) {
          // Permanently conflicted — stop retrying.
          await SyncQueue.remove(entry.sessionId);
          console.warn('[SessionLinker] Conflict on retry, dropping:', entry.sessionId);
        } else {
          await SyncQueue.recordFailure(entry.sessionId);
          console.warn('[SessionLinker] Retry failed:', entry.sessionId, msg);
        }
      }
    }
  },
};

async function _link(sessionId: string, url: string, tabId: number): Promise<void> {
  try {
    await api.linkSession(sessionId, url);
    await TabRegistry.update(tabId, { linkedUrl: url, syncStatus: 'synced' });
    await SyncQueue.remove(sessionId);
    console.log('[SessionLinker] Linked', sessionId, '→', url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('HTTP 409')) {
      // Session is already bound to a different URL — no point retrying.
      await TabRegistry.update(tabId, { syncStatus: 'failed' });
      console.warn('[SessionLinker] Session already linked to different URL:', sessionId);
      return;
    }
    // Transient failure: queue for exponential-backoff retry.
    await SyncQueue.enqueue(sessionId, url);
    await TabRegistry.update(tabId, { syncStatus: 'pending' });
    console.warn('[SessionLinker] Link failed, queued for retry:', sessionId, msg);
  }
}
