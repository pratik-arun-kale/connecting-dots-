'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/lib/api/services/auth.service';

/**
 * Runs once on app load. The access token is memory-only (see
 * auth-store.ts), so every page load starts with status 'idle' and needs one
 * silent refresh — the browser sends the httpOnly refresh cookie — to get a
 * live access token. A refresh token left in localStorage by an older build
 * is sent once in the body instead, and the API answers with a cookie.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { status, user, legacyRefreshToken, setSession, clearSession } = useAuthStore.getState();
    if (status !== 'idle') return;

    // No remembered user and nothing to migrate: never logged in here, so
    // skip a refresh request that can only come back 401.
    if (!user && !legacyRefreshToken) {
      clearSession();
      return;
    }

    authService
      .refresh(legacyRefreshToken)
      .then(setSession)
      .catch(() => clearSession());
  }, []);

  return <>{children}</>;
}
