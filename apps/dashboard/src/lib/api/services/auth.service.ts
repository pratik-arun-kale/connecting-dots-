import apiClient from '../client';

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

// Plain axios calls (not going through the request interceptor's auth-header
// logic in any special way — register/login/refresh don't need a bearer token,
// and the response interceptor explicitly skips 401→refresh handling for
// anything under /auth/ so a wrong password can't trigger a refresh loop).
export const authService = {
  async register(email: string, password: string): Promise<TokenPair> {
    const response = await apiClient.post<TokenPair>('/auth/register', { email, password });
    return response.data;
  },

  async login(email: string, password: string): Promise<TokenPair> {
    const response = await apiClient.post<TokenPair>('/auth/login', { email, password });
    return response.data;
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    const response = await apiClient.post<TokenPair>('/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refresh_token: refreshToken });
  },
};
