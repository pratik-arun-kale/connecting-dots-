'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/lib/api/services/auth.service';

/**
 * Runs once on app load. zustand's persist middleware rehydrates
 * `refreshToken`/`user` from localStorage synchronously before this effect
 * fires, but `accessToken` is never persisted (see auth-store.ts) — so
 * every page load starts with status 'idle' and needs one silent refresh
 * to turn a persisted refresh token back into a live access token.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { status, refreshToken, setSession, clearSession } = useAuthStore.getState();
    if (status !== 'idle') return;

    if (!refreshToken) {
      clearSession();
      return;
    }

    authService
      .refresh(refreshToken)
      .then(setSession)
      .catch(() => clearSession());
  }, []);

  return <>{children}</>;
}
