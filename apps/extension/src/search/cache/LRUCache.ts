/**
 * src/search/cache/LRUCache.ts
 * ───────────────────────────────────
 * Generic LRU cache with per-entry TTL. Built on a plain Map, which — per the
 * spec — iterates in insertion order; `get` re-inserts the key to bump it to
 * "most recently used", and `set` evicts the oldest (first) entry once over
 * capacity. No external dependency: this is ~40 lines and fully unit-testable.
 */
import type { CacheEntry, CacheStats } from '../types'

export class LRUCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()
  private hits = 0
  private misses = 0

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      this.misses++
      return undefined
    }
    // Bump recency: delete + re-insert moves it to the end of Map's iteration order.
    this.store.delete(key)
    this.store.set(key, entry)
    this.hits++
    return entry.value
  }

  set(key: string, value: T): void {
    this.store.delete(key) // so a re-set also bumps recency, not just inserts
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    if (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) this.store.delete(oldestKey)
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
    this.hits = 0
    this.misses = 0
  }

  get stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: this.store.size }
  }
}
