import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, TokenPair } from '@/lib/api/services/auth.service';

type AuthStatus = 'idle' | 'authenticated' | 'unauthenticated';

/**
 * No token is ever written to localStorage. The refresh token is an
 * httpOnly cookie set by the API (page script can't read it); the access
 * token lives only in memory and is re-derived on each page load by a
 * silent refresh (see AuthProvider). Only `user` is persisted, as a hint
 * that a cookie session probably exists — so a logged-out visitor isn't
 * sent through a refresh request that can only fail.
 */
interface AuthState {
  // 'idle' = not yet resolved on this page load (AuthProvider is trying a
  // silent refresh) — the (workspace) layout guard treats this as
  // "loading", not "redirect to /login", so a logged-in user doesn't flash
  // through the login page on every reload.
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  // A refresh token that an older build left in localStorage. AuthProvider
  // trades it once for a cookie session; never persisted again.
  legacyRefreshToken: string | null;
  setSession: (tokens: TokenPair) => void;
  /** Replace the signed-in user's profile (e.g. after verifying the email). */
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
}

interface PersistedV0 {
  refreshToken?: string | null;
  user?: AuthUser | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'idle',
      accessToken: null,
      user: null,
      legacyRefreshToken: null,
      setSession: (tokens) =>
        set({
          status: 'authenticated',
          accessToken: tokens.access_token,
          user: tokens.user,
          legacyRefreshToken: null,
        }),
      setUser: (user) => set((state) => (state.user?.id === user.id ? { user } : {})),
      clearSession: () =>
        set({ status: 'unauthenticated', accessToken: null, user: null, legacyRefreshToken: null }),
    }),
    {
      name: 'cw-auth',
      version: 1,
      partialize: (state) => ({ user: state.user }),
      // v0 persisted the refresh token itself. Move it into memory (for the
      // one-time exchange) and drop it from storage on the next write.
      migrate: (persisted, version) => {
        if (version === 0) {
          const old = (persisted ?? {}) as PersistedV0;
          return { user: old.user ?? null, legacyRefreshToken: old.refreshToken ?? null } as AuthState;
        }
        return persisted as AuthState;
      },
    },
  ),
);
