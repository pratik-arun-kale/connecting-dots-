import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY } from './tokenStorage';
import { REFRESH_LOCK, refreshOnce } from './authorizedFetch';

const BASE = 'https://api.test/api/v1';

/** chrome.storage.session/local backed by one Map each, like the real thing. */
function fakeChromeStorage() {
  const area = (data: Map<string, unknown>) => ({
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) data.delete(k);
    }),
  });
  const session = new Map<string, unknown>();
  const local = new Map<string, unknown>();
  vi.stubGlobal('chrome', { storage: { session: area(session), local: area(local) } });
  return { session, local };
}

/** A Web Lock that really serialises callers, like navigator.locks. */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, cb: () => Promise<unknown>) => {
    const prev = queues.get(name) ?? Promise.resolve();
    const next = prev.then(cb, cb);
    queues.set(name, next.catch(() => undefined));
    return next;
  });
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return request;
}

function pair(n: number) {
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: 'bearer',
    expires_in: 900,
    user: { id: 'u1', email: 'a@b.c' },
  };
}

describe('refreshOnce across extension contexts', () => {
  let storage: ReturnType<typeof fakeChromeStorage>;

  beforeEach(() => {
    storage = fakeChromeStorage();
    storage.local.set(REFRESH_TOKEN_KEY, 'refresh-0');
    storage.local.set(USER_KEY, pair(0).user);
    storage.session.set(ACCESS_TOKEN_KEY, 'access-0');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('takes the shared lock and stores the new pair', async () => {
    const locks = fakeLocks();
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify(pair(1)), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshOnce(BASE)).resolves.toBe('access-1');
    expect(locks).toHaveBeenCalledWith(REFRESH_LOCK, expect.any(Function));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ refresh_token: 'refresh-0' });
    expect(storage.local.get(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('does not resend a token another context rotated while it waited', async () => {
    fakeLocks();
    // Another context (say the popup) holds the lock and rotates the token.
    let release!: () => void;
    const otherHolds = navigator.locks.request(REFRESH_LOCK, async () => {
      await new Promise<void>((r) => (release = r));
      storage.local.set(REFRESH_TOKEN_KEY, 'refresh-1');
      storage.session.set(ACCESS_TOKEN_KEY, 'access-1');
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ours = refreshOnce(BASE); // read refresh-0, then waits for the lock
    await Promise.resolve();
    release();
    await otherHolds;

    await expect(ours).resolves.toBe('access-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still refreshes where Web Locks are missing', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(pair(1)), { status: 200 })));
    await expect(refreshOnce(BASE)).resolves.toBe('access-1');
  });
});
