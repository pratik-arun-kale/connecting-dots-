/**
 * SyncQueue — persistent retry queue for session link operations.
 *
 * When the backend is unreachable, entries accumulate here and are
 * retried on an exponential backoff schedule via chrome.alarms.
 * The sessionId acts as the idempotency key — re-queuing the same
 * session for the same URL is a no-op.
 */

const STORAGE_KEY = 'syncQueue';

// Retry delays in ms: 1s, 2s, 4s, 8s, 16s, 32s (6 attempts total)
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export interface SyncQueueEntry {
  sessionId: string;
  url: string;
  attempts: number;
  nextRetryAt: number; // ms since epoch
}

type QueueMap = Record<string, SyncQueueEntry>; // key = sessionId

async function load(): Promise<QueueMap> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as QueueMap) ?? {});
    });
  });
}

async function persist(map: QueueMap): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: map }, resolve);
  });
}

export const SyncQueue = {
  /** Add a session to the retry queue. No-op if already queued for the same URL. */
  async enqueue(sessionId: string, url: string): Promise<void> {
    const map = await load();
    if (map[sessionId]?.url === url) return; // idempotent
    map[sessionId] = { sessionId, url, attempts: 0, nextRetryAt: Date.now() };
    await persist(map);
  },

  /** Remove a successfully synced entry. */
  async remove(sessionId: string): Promise<void> {
    const map = await load();
    delete map[sessionId];
    await persist(map);
  },

  /** Return all entries whose retry window has elapsed. */
  async due(): Promise<SyncQueueEntry[]> {
    const map = await load();
    const now = Date.now();
    return Object.values(map).filter((e) => e.nextRetryAt <= now);
  },

  /**
   * Record a failed attempt and schedule the next retry.
   * Drops the entry permanently when max attempts is reached.
   */
  async recordFailure(sessionId: string): Promise<void> {
    const map = await load();
    const entry = map[sessionId];
    if (!entry) return;

    const attempts = entry.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      console.warn('[SyncQueue] Giving up on session', sessionId, 'after', MAX_ATTEMPTS, 'attempts');
      delete map[sessionId];
    } else {
      map[sessionId] = {
        ...entry,
        attempts,
        nextRetryAt: Date.now() + RETRY_DELAYS_MS[attempts],
      };
    }
    await persist(map);
  },
};
