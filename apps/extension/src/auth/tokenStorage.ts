/**
 * src/auth/tokenStorage.ts
 * ─────────────────────────
 * Single source of truth for where auth tokens live, shared by every
 * extension context (background service worker, popup, side panel, and
 * indirectly the note content script via background's messages).
 *
 * Storage split is deliberate:
 *  - access_token → chrome.storage.session — cleared when the browser
 *    closes, never written to disk. Shortest reasonable exposure window for
 *    the more powerful of the two tokens.
 *  - refresh_token + user → chrome.storage.local — persists across browser
 *    restarts (so the user isn't asked to log in every time), and across
 *    service-worker restarts (MV3 kills the SW aggressively; a plain JS
 *    variable would not survive that, chrome.storage does).
 * Same trade-off already documented for the Next.js dashboard's auth store:
 * a bearer token in JS/extension-reachable storage is more exposed than an
 * httpOnly cookie, mitigated by short access-token TTL + refresh rotation
 * with reuse detection on the backend.
 */

export interface StoredUser {
  id: string;
  email: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: StoredUser;
}

export const ACCESS_TOKEN_KEY = 'cw_access_token';
export const REFRESH_TOKEN_KEY = 'cw_refresh_token';
export const USER_KEY = 'cw_user';

export async function getAccessToken(): Promise<string | null> {
  const stored = await chrome.storage.session.get(ACCESS_TOKEN_KEY);
  return (stored[ACCESS_TOKEN_KEY] as string | undefined) ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const stored = await chrome.storage.local.get(REFRESH_TOKEN_KEY);
  return (stored[REFRESH_TOKEN_KEY] as string | undefined) ?? null;
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const stored = await chrome.storage.local.get(USER_KEY);
  return (stored[USER_KEY] as StoredUser | undefined) ?? null;
}

export async function setSession(tokens: TokenPair): Promise<void> {
  await Promise.all([
    chrome.storage.session.set({ [ACCESS_TOKEN_KEY]: tokens.access_token }),
    chrome.storage.local.set({ [REFRESH_TOKEN_KEY]: tokens.refresh_token, [USER_KEY]: tokens.user }),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    chrome.storage.session.remove(ACCESS_TOKEN_KEY),
    chrome.storage.local.remove([REFRESH_TOKEN_KEY, USER_KEY]),
  ]);
}
