import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, TokenPair } from '@/lib/api/services/auth.service';

type AuthStatus = 'idle' | 'authenticated' | 'unauthenticated';

interface AuthState {
  // 'idle' = not yet resolved on this page load (AuthProvider is trying a
  // silent refresh from the persisted refresh token) — the (workspace)
  // layout guard treats this as "loading", not "redirect to /login", so a
  // logged-in user doesn't flash through the login page on every reload.
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (tokens: TokenPair) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'idle',
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (tokens) =>
        set({
          status: 'authenticated',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user: tokens.user,
        }),
      clearSession: () =>
        set({ status: 'unauthenticated', accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'cw-auth',
      // Only the refresh token survives a reload. The access token is
      // deliberately kept memory-only (re-derived via a silent refresh on
      // load) to shrink its window of exposure in localStorage — the
      // refresh token itself still sits in JS-reachable storage (a real
      // trade-off for a Chrome-extension-compatible bearer-token design
      // instead of httpOnly cookies), mitigated by short access-token TTL
      // and refresh rotation + reuse detection on the backend.
      partialize: (state) => ({ refreshToken: state.refreshToken, user: state.user }),
    },
  ),
);
