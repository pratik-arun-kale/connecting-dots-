/**
 * src/search/cache/searchCache.ts
 * ───────────────────────────────────
 * The search feature's one LRU cache instance + its key derivation. A module-
 * level singleton (not per-hook-instance) so navigating away from and back to
 * the search section — or having it mounted in both the popup and a future
 * surface — shares warm results instead of re-fetching.
 */
import { LRUCache } from './LRUCache'
import { normalizeQuery } from '../utils/query'
import type { SafeSearchResponse } from '../types'

export const DEFAULT_CACHE_MAX_ENTRIES = 50
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — long enough to survive re-opening the section, short enough that newly-captured conversations show up soon

export function buildCacheKey(projectId: string, query: string, topK: number): string {
  return `${projectId}::${topK}::${normalizeQuery(query)}`
}

export const searchResultCache = new LRUCache<SafeSearchResponse>(
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
)
