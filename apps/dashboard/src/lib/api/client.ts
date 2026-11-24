import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '@/lib/constants';
import { useAuthStore } from '@/store/auth-store';
import { coldStartRetry, startSlowTimer } from './cold-start';

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
    startSlowTimer(config);
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — on a 401, try exactly one silent refresh (deduped
// across concurrent requests via a single shared in-flight promise) and
// retry the original request with the new access token. The refresh token
// is an httpOnly cookie this code never sees; the browser sends it. If the
// refresh fails, the session is cleared and the user is bounced to /login. Requests to /auth/* are excluded from
// this logic entirely — a wrong password on /auth/login also comes back as
// 401, and retrying THAT via a token refresh would be nonsensical (and can
// never succeed, since login failures aren't a token problem).
let refreshPromise: Promise<string> | null = null;

// Auth routes that don't take an access token — a 401 from these is never
// fixed by a refresh. Signed-in ones (verify-email/request, logout-all) do
// get the usual refresh-and-retry.
const NO_REFRESH = /\/auth\/(login|register|refresh|logout|verify-email|password-reset)(\/confirm)?$/;

function isAuthEndpoint(url?: string): boolean {
  return !!url && NO_REFRESH.test(url.split('?')[0]);
}

apiClient.interceptors.response.use(
  (response) => {
    response.config._slow?.finish();
    return response;
  },
  async (error: AxiosError) => {
    // A sleeping API (cold start): ask once more, with longer to answer.
    // The "waking up" timer keeps running across the retry.
    const again = coldStartRetry(error);
    if (again) return apiClient(again);
    error.config?._slow?.finish();

    const status = error.response?.status;
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (status !== 401 || !originalRequest || originalRequest._retry || isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    const { setSession, clearSession } = useAuthStore.getState();
    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = (async () => {
          const { authService } = await import('./services/auth.service');
          const tokens = await authService.refresh();
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
      // A full page load on purpose: it drops every cached query and in-memory
      // state of the signed-out user. This runs outside React, so there is no
      // router to use here anyway.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== 'undefined') window.location.href = '/login';
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
