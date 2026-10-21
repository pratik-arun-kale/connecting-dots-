import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LRUCache } from './LRUCache'

describe('LRUCache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns undefined on miss and records it', () => {
    const cache = new LRUCache<string>(3, 1000)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.stats.misses).toBe(1)
    expect(cache.stats.hits).toBe(0)
  })

  it('returns the stored value on hit and records it', () => {
    const cache = new LRUCache<string>(3, 1000)
    cache.set('a', 'value-a')
    expect(cache.get('a')).toBe('value-a')
    expect(cache.stats.hits).toBe(1)
  })

  it('expires entries past their TTL', () => {
    const cache = new LRUCache<string>(3, 1000)
    cache.set('a', 'value-a')
    vi.advanceTimersByTime(1001)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.stats.misses).toBe(1)
  })

  it('does not expire entries just under TTL', () => {
    const cache = new LRUCache<string>(3, 1000)
    cache.set('a', 'value-a')
    vi.advanceTimersByTime(999)
    expect(cache.get('a')).toBe('value-a')
  })

  it('evicts the least-recently-used entry once over capacity', () => {
    const cache = new LRUCache<string>(2, 10_000)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3') // evicts 'a' (oldest, never touched)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })

  it('a get() bumps recency so the touched entry survives eviction', () => {
    const cache = new LRUCache<string>(2, 10_000)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.get('a') // 'a' is now most-recently-used; 'b' becomes the eviction candidate
    cache.set('c', '3')
    expect(cache.get('a')).toBe('1')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe('3')
  })

  it('re-setting an existing key bumps recency instead of just overwriting in place', () => {
    const cache = new LRUCache<string>(2, 10_000)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('a', '1-updated') // 'a' bumped to most-recent
    cache.set('c', '3') // should evict 'b', not 'a'
    expect(cache.get('a')).toBe('1-updated')
    expect(cache.get('b')).toBeUndefined()
  })

  it('clear() empties the cache and resets stats', () => {
    const cache = new LRUCache<string>(3, 1000)
    cache.set('a', '1')
    cache.get('a')
    cache.get('missing')
    cache.clear()
    expect(cache.stats).toEqual({ hits: 0, misses: 0, size: 0 })
    expect(cache.get('a')).toBeUndefined()
  })

  it('delete() removes a single key without affecting others', () => {
    const cache = new LRUCache<string>(3, 1000)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('2')
  })
})
