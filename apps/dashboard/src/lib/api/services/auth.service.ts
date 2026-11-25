import apiClient from '../client';

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  /** null until the address is confirmed through an emailed link. */
  email_verified_at: string | null;
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

  /**
   * Rotates the cookie. `legacyToken` is only for moving an old localStorage token into a cookie.
   *
   * Tabs take turns (a Web Lock shared by every tab of this origin): the next
   * tab sends the cookie the previous one just received, not the one it
   * replaced. The API also tolerates a just-rotated token for a few seconds,
   * so a browser without Web Locks still isn't signed out.
   */
  async refresh(legacyToken?: string | null): Promise<TokenPair> {
    const body = legacyToken ? { refresh_token: legacyToken } : {};
    const send = async () => (await apiClient.post<TokenPair>('/auth/refresh', body, COOKIE_MODE)).data;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('cd-refresh', send);
    }
    return send();
  },

  /** Revokes this session's refresh token and clears the cookie. */
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', {}, COOKIE_MODE);
  },

  /** Emails the signed-in user a new verification link (no-op once verified). */
  async requestVerification(): Promise<void> {
    await apiClient.post('/auth/verify-email/request');
  },

  /** Redeems the token from a verification link. Works signed in or not. */
  async verifyEmail(token: string): Promise<AuthUser> {
    const response = await apiClient.post<AuthUser>('/auth/verify-email', { token });
    return response.data;
  },

  /** Always resolves the same way, whether or not the address has an account. */
  async requestPasswordReset(email: string): Promise<void> {
    await apiClient.post('/auth/password-reset', { email });
  },

  /** Sets a new password from a reset link. Signs out every session, this one included. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/password-reset/confirm', { token, new_password: newPassword }, COOKIE_MODE);
  },

  /** Revokes every session for this account, on every device. */
  async logoutAll(): Promise<void> {
    await apiClient.post('/auth/logout-all', {}, COOKIE_MODE);
  },

  /** Deletes the account and everything in it, for good. Needs the current password. */
  async deleteAccount(password: string): Promise<void> {
    await apiClient.delete('/auth/account', { ...COOKIE_MODE, data: { password } });
  },
};
