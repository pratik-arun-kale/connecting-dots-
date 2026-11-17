import apiClient from '../client';

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  // Always null for the dashboard: the API sets the refresh token as an
  // httpOnly cookie instead (cookie mode, below). The extension gets it here.
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

/**
 * Cookie mode: `X-Auth-Mode: cookie` asks the API to keep the refresh token
 * in an httpOnly cookie scoped to /auth, and `withCredentials` lets the
 * browser send and store that cookie on these cross-origin calls. The API
 * only honours it for an allowed Origin (see services/api auth routes).
 */
const COOKIE_MODE = { withCredentials: true, headers: { 'X-Auth-Mode': 'cookie' } } as const;

// The response interceptor in ../client skips 401→refresh handling for
// anything under /auth/, so a wrong password can't trigger a refresh loop.
export const authService = {
  async register(email: string, password: string): Promise<TokenPair> {
    const response = await apiClient.post<TokenPair>('/auth/register', { email, password }, COOKIE_MODE);
    return response.data;
  },

  async login(email: string, password: string): Promise<TokenPair> {
    const response = await apiClient.post<TokenPair>('/auth/login', { email, password }, COOKIE_MODE);
    return response.data;
  },

  /** Rotates the cookie. `legacyToken` is only for moving an old localStorage token into a cookie. */
  async refresh(legacyToken?: string | null): Promise<TokenPair> {
    const body = legacyToken ? { refresh_token: legacyToken } : {};
    const response = await apiClient.post<TokenPair>('/auth/refresh', body, COOKIE_MODE);
    return response.data;
  },

  /** Revokes this session's refresh token and clears the cookie. */
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', {}, COOKIE_MODE);
  },

  /** Revokes every session for this account, on every device. */
  async logoutAll(): Promise<void> {
    await apiClient.post('/auth/logout-all', {}, COOKIE_MODE);
  },
};
