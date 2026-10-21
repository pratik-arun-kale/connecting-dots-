import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/lib/constants';
import { useAuthStore } from '@/store/auth-store';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attaches the current access token from the auth
// store. Read via getState() (not the useAuthStore() hook) because this
// runs outside React's render tree.
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — on a 401, try exactly one silent refresh (deduped
// across concurrent requests via a single shared in-flight promise) and
// retry the original request with the new access token. If the refresh
// itself fails, or there's no refresh token to try, the session is cleared
// and the user is bounced to /login. Requests to /auth/* are excluded from
// this logic entirely — a wrong password on /auth/login also comes back as
// 401, and retrying THAT via a token refresh would be nonsensical (and can
// never succeed, since login failures aren't a token problem).
let refreshPromise: Promise<string> | null = null;

function isAuthEndpoint(url?: string): boolean {
  return !!url && url.includes('/auth/');
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (status !== 401 || !originalRequest || originalRequest._retry || isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    const { refreshToken, setSession, clearSession } = useAuthStore.getState();
    if (!refreshToken) {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const { authService } = await import('./services/auth.service');
          const tokens = await authService.refresh(refreshToken);
          setSession(tokens);
          return tokens.access_token;
        })().finally(() => {
          refreshPromise = null;
        });
      }
      const newAccessToken = await refreshPromise;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
