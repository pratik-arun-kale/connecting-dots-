/**
 * src/auth/authorizedFetch.ts
 * ─────────────────────────────
 * Shared "attach the bearer token, and on a 401 try exactly one silent
 * refresh + retry" logic, usable from any context (service worker, popup,
 * side panel) since it only depends on the Fetch API + chrome.storage —
 * the axios-interceptor equivalent of what the Next.js dashboard's
 * lib/api/client.ts does, adapted for plain fetch() call sites.
 *
 * Concurrent 401s are deduped onto one shared in-flight refresh via
 * `refreshPromise` — the same pattern as the dashboard client.
 */
import { getAccessToken, getRefreshToken, setSession, clearSession } from './tokenStorage';

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(baseUrl: string): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await clearSession();
      return null;
    }
    const tokens = await res.json();
    await setSession(tokens);
    return tokens.access_token as string;
  } catch {
    return null; // network error — leave the stored (still-valid-looking) session alone, caller's request just stays failed
  }
}

/** Refreshes at most once even if several requests 401 at the same time. */
export function refreshOnce(baseUrl: string): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh(baseUrl).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Builds a RequestInit with Authorization + Content-Type headers attached. */
export async function withAuthHeader(init: RequestInit = {}): Promise<RequestInit> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * High-level helper for simple call sites: attaches the token, and on a 401
 * tries one refresh + retry before giving up. Requests to /auth/* skip the
 * refresh dance entirely — a wrong password there also 401s, and retrying
 * that via a token refresh can never succeed.
 */
export async function authorizedFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (path.startsWith('/auth/')) {
    return fetch(`${baseUrl}${path}`, init);
  }

  const first = await fetch(`${baseUrl}${path}`, await withAuthHeader(init));
  if (first.status !== 401) return first;

  const newToken = await refreshOnce(baseUrl);
  if (!newToken) return first; // refresh failed — surface the original 401 to the caller

  return fetch(`${baseUrl}${path}`, await withAuthHeader(init));
}
