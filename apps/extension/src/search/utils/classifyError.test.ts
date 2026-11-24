import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyHttpStatus, classifyThrown, buildSearchError } from './classifyError'

describe('classifyHttpStatus', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [400, 'bad_request'],
    [422, 'bad_request'],
    [500, 'server_error'],
    [503, 'server_error'],
    [418, 'unknown'],
  ] as const)('maps status %d to %s', (status, expected) => {
    expect(classifyHttpStatus(status)).toBe(expected)
  })
})

describe('buildSearchError', () => {
  it('marks unauthorized/forbidden/not_found/cancelled as not retryable', () => {
    expect(buildSearchError('unauthorized').retryable).toBe(false)
    expect(buildSearchError('forbidden').retryable).toBe(false)
    expect(buildSearchError('not_found').retryable).toBe(false)
    expect(buildSearchError('cancelled').retryable).toBe(false)
  })

  it('marks transient errors as retryable', () => {
    expect(buildSearchError('offline').retryable).toBe(true)
    expect(buildSearchError('timeout').retryable).toBe(true)
    expect(buildSearchError('server_error').retryable).toBe(true)
    expect(buildSearchError('malformed_response').retryable).toBe(true)
  })

  it('produces a non-empty human-friendly message for every user-facing kind', () => {
    for (const kind of ['offline', 'timeout', 'unauthorized', 'forbidden', 'not_found', 'bad_request', 'server_error', 'malformed_response', 'unknown'] as const) {
      expect(buildSearchError(kind).message.length).toBeGreaterThan(0)
    }
  })
})

describe('classifyThrown', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('classifies as offline when navigator.onLine is false', () => {
    vi.stubGlobal('navigator', { onLine: false })
    const err = classifyThrown(new Error('network fail'))
    expect(err.kind).toBe('offline')
  })

  it('classifies an AbortError as cancelled', () => {
    vi.stubGlobal('navigator', { onLine: true })
    const err = classifyThrown(new DOMException('aborted', 'AbortError'))
    expect(err.kind).toBe('cancelled')
  })

  it('classifies a TypeError (fetch network failure) as offline', () => {
    vi.stubGlobal('navigator', { onLine: true })
    const err = classifyThrown(new TypeError('Failed to fetch'))
    expect(err.kind).toBe('offline')
  })

  it('falls back to unknown for an unrecognized thrown value', () => {
    vi.stubGlobal('navigator', { onLine: true })
    const err = classifyThrown('a plain string error')
    expect(err.kind).toBe('unknown')
  })
})
