/**
 * React hook exposing live auth status inside popup/side panel React trees.
 *
 * Popup and side panel are separate bundles (separate JS contexts at
 * runtime, even though they share this source file) — this module-level
 * singleton only syncs *within* one bundle on its own, but both bundles
 * additionally listen to chrome.storage.onChanged, so logging out in one
 * surface is reflected live in the other if both happen to be open.
 */
import { useSyncExternalStore } from 'react';
import { getRefreshToken, getStoredUser, REFRESH_TOKEN_KEY, USER_KEY, type StoredUser } from './tokenStorage';

export interface AuthSnapshot {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: StoredUser | null;
}

let snapshot: AuthSnapshot = { status: 'loading', user: null };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

async function refreshSnapshot() {
  const [refreshToken, user] = await Promise.all([getRefreshToken(), getStoredUser()]);
  snapshot = refreshToken ? { status: 'authenticated', user } : { status: 'unauthenticated', user: null };
  notify();
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[REFRESH_TOKEN_KEY] || changes[USER_KEY])) {
      void refreshSnapshot();
    }
  });
  void refreshSnapshot();
}

/** Call after a successful login/logout so this bundle's own UI updates immediately
 *  (chrome.storage.onChanged also fires for same-context writes, but calling this
 *  directly avoids waiting on that round trip). */
export function notifyAuthChanged(): void {
  void refreshSnapshot();
}

export function useAuthSession(): AuthSnapshot {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => snapshot,
  );
}
