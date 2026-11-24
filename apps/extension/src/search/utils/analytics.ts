/**
 * src/search/utils/analytics.ts
 * ───────────────────────────────────
 * Development-only telemetry for the search feature — latency, result count,
 * cache hit rate, failures, cancellations. Gated on `import.meta.env.DEV`
 * (Vite's standard build-time flag) so every call here is dead code in the
 * production bundle, not just silenced at runtime. No network calls, no
 * external analytics SDK — this is a local debugging aid, not user tracking.
 */
import type { CacheStats, SearchErrorKind } from '../types'

const isDev = (): boolean => {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
}

interface SearchAnalyticsSnapshot {
  totalSearches: number
  cacheHits: number
  cacheMisses: number
  cancelledRequests: number
  failures: Record<SearchErrorKind, number>
  latenciesMs: number[]
}

function emptyFailures(): Record<SearchErrorKind, number> {
  return {
    offline: 0, timeout: 0, unauthorized: 0, forbidden: 0, not_found: 0,
    bad_request: 0, server_error: 0, malformed_response: 0, cancelled: 0, unknown: 0,
  }
}

const snapshot: SearchAnalyticsSnapshot = {
  totalSearches: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cancelledRequests: 0,
  failures: emptyFailures(),
  latenciesMs: [],
}

export const searchAnalytics = {
  recordSearchStart(query: string): void {
    if (!isDev()) return
    snapshot.totalSearches++
    console.debug('[search] request start', { query })
  },

  recordSuccess(latencyMs: number, resultCount: number, fromCache: boolean): void {
    if (!isDev()) return
    if (fromCache) snapshot.cacheHits++
    else { snapshot.cacheMisses++; snapshot.latenciesMs.push(latencyMs) }
    console.debug('[search] success', { latencyMs, resultCount, fromCache })
  },

  recordCancelled(): void {
    if (!isDev()) return
    snapshot.cancelledRequests++
    console.debug('[search] request cancelled (superseded)')
  },

  recordFailure(kind: SearchErrorKind, detail?: string): void {
    if (!isDev()) return
    snapshot.failures[kind]++
    console.warn('[search] request failed', { kind, detail })
  },

  /** Returns a snapshot for ad-hoc inspection (e.g. from the browser console in dev builds). */
  getSnapshot(cacheStats?: CacheStats): Readonly<SearchAnalyticsSnapshot & { cacheStats?: CacheStats; avgLatencyMs: number }> {
    const avg = snapshot.latenciesMs.length
      ? snapshot.latenciesMs.reduce((a, b) => a + b, 0) / snapshot.latenciesMs.length
      : 0
    return { ...snapshot, cacheStats, avgLatencyMs: avg }
  },

  reset(): void {
    snapshot.totalSearches = 0
    snapshot.cacheHits = 0
    snapshot.cacheMisses = 0
    snapshot.cancelledRequests = 0
    snapshot.failures = emptyFailures()
    snapshot.latenciesMs = []
  },
}
