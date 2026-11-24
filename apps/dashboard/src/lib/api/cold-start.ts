import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { create } from 'zustand';

/**
 * Cloud Run scales the API to zero when idle, and starting it again can take
 * longer than the client's usual 10 s. A request that times out or can't
 * connect is asked once more with COLD_START_TIMEOUT_MS, and while any such
 * request is slower than SLOW_REQUEST_MS the page says the server is waking up
 * (<ServerWakingNotice />).
 *
 * Only requests that are safe to send twice: reads, and the silent refresh
 * (a refresh that did reach the API and rotated the token is accepted again
 * for a few seconds; see AuthService.refresh). Ask AI has its own long
 * timeout and spinner and isn't covered.
 */
export const SLOW_REQUEST_MS = 3_000;
export const COLD_START_TIMEOUT_MS = 45_000;

/** How many covered requests are past SLOW_REQUEST_MS right now. */
export const useServerWaking = create<{ slow: number }>(() => ({ slow: 0 }));

interface SlowTracker {
  finished: boolean;
  finish: () => void;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _coldRetry?: boolean;
    _slow?: SlowTracker;
  }
}

export function coversColdStart(config: InternalAxiosRequestConfig): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  if (method === 'get' || method === 'head') return true;
  return method === 'post' && /\/auth\/refresh$/.test((config.url ?? '').split('?')[0]);
}

/** A timeout or no connection at all: what a sleeping API looks like. */
export function looksLikeColdStart(error: AxiosError): boolean {
  if (error.response) return false;
  return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ERR_NETWORK';
}

/** Starts the slow-request timer for a covered request (kept across its retry). */
export function startSlowTimer(config: InternalAxiosRequestConfig): void {
  if (!coversColdStart(config) || (config._slow && !config._slow.finished)) return;
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    useServerWaking.setState((s) => ({ slow: s.slow + 1 }));
  }, SLOW_REQUEST_MS);
  const tracker: SlowTracker = {
    finished: false,
    finish: () => {
      if (tracker.finished) return;
      tracker.finished = true;
      clearTimeout(timer);
      if (counted) useServerWaking.setState((s) => ({ slow: Math.max(0, s.slow - 1) }));
    },
  };
  config._slow = tracker;
}

/** Returns the config to send again, or null when this failure isn't retried. */
export function coldStartRetry(error: AxiosError): InternalAxiosRequestConfig | null {
  const config = error.config;
  if (!config || config._coldRetry || !coversColdStart(config) || !looksLikeColdStart(error)) return null;
  config._coldRetry = true;
  config.timeout = Math.max(config.timeout ?? 0, COLD_START_TIMEOUT_MS);
  return config;
}
