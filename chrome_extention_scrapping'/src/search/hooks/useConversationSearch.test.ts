import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConversationSearch } from './useConversationSearch'
import { searchResultCache } from '../cache/searchCache'
import { searchAnalytics } from '../utils/analytics'

const okBody = (title = 'RAG Chunking') => ({
  query_used: 'RAG',
  corrective_triggered: false,
  chunks_indexed: 3,
  total_conversations: 1,
  conversations: [
    {
      conversation_id: 'c1',
      title,
      chat_url: 'https://chatgpt.com/c/1',
      provider: 'chatgpt',
      relevance_score: 3.7,
      summary: null,
      top_relevant_snippets: ['snippet text'],
    },
  ],
})

describe('useConversationSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    searchResultCache.clear()
    searchAnalytics.reset()
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function mockFetchSuccess(body: unknown = okBody(), delayMs = 0) {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), delayMs)
      init.signal?.addEventListener('abort', () => {
        clearTimeout(t)
        reject(new DOMException('aborted', 'AbortError'))
      })
    })))
  }

  it('does not search below the 3-character minimum, even on an explicit submit', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()
    act(() => result.current.submit('ra'))
    expect(result.current.status).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('typing alone never triggers a search — setQuery only updates the input value', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()

    act(() => result.current.setQuery('r'))
    act(() => result.current.setQuery('ra'))
    act(() => result.current.setQuery('rag'))
    act(() => result.current.setQuery('rag chunking strategy'))

    // Give any (incorrectly) scheduled async work a chance to run.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(result.current.query).toBe('rag chunking strategy')
    expect(result.current.status).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('submit() (Enter / the search button) fires exactly one request', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()

    act(() => result.current.setQuery('rag chunking'))
    act(() => result.current.submit())

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('submit() with an empty query does nothing', () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    vi.stubGlobal('fetch', vi.fn())
    act(() => result.current.submit())
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('cancels the previous request when a newer one is dispatched', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    let firstSignalAborted = false
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () => { firstSignalAborted = true })
      return new Promise(() => {}) // never resolves — simulates a slow backend
    }))

    act(() => result.current.submit('first query'))
    await act(async () => { await Promise.resolve() })
    act(() => result.current.submit('second query'))
    await act(async () => { await Promise.resolve() })

    expect(firstSignalAborted).toBe(true)
  })

  it('does not dispatch a duplicate request for an identical in-flight query', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess(okBody(), 50)

    act(() => result.current.submit('rag topic'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    act(() => result.current.submit('rag topic')) // identical, still in flight
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('serves a repeat search from cache without a second network call', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()

    act(() => result.current.submit('rag topic'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetch).toHaveBeenCalledTimes(1)

    act(() => result.current.clear())
    act(() => result.current.submit('rag topic'))
    expect(result.current.fromCache).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1) // still just once — served from cache
  })

  it('ignores a stale response when a newer request already landed first', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    let resolveFirst: ((r: Response) => void) | undefined
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn((_url: string) => {
      callCount++
      if (callCount === 1) {
        return new Promise<Response>(resolve => { resolveFirst = resolve })
      }
      return Promise.resolve(new Response(JSON.stringify(okBody('Second, faster result')), { status: 200 }))
    }))

    act(() => result.current.submit('slow query'))
    await act(async () => { await Promise.resolve() })
    act(() => result.current.submit('fast query'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.result?.conversations[0].title).toBe('Second, faster result')

    // The slow first request finally resolves — must NOT clobber the newer result.
    await act(async () => {
      resolveFirst?.(new Response(JSON.stringify(okBody('Stale first result')), { status: 200 }))
      await Promise.resolve()
    })
    expect(result.current.result?.conversations[0].title).toBe('Second, faster result')
  })

  it('surfaces an offline error without dispatching a network request', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    vi.stubGlobal('fetch', vi.fn())

    act(() => result.current.submit('rag topic'))

    expect(result.current.status).toBe('error')
    expect(result.current.error?.kind).toBe('offline')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces a timeout error and allows retry', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))

    act(() => result.current.submit('rag topic'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001) })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.kind).toBe('timeout')

    // retry() re-issues the same query.
    mockFetchSuccess()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('success'))
  })

  it('surfaces malformed_response without crashing on a 200 with an unexpected body', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess({ nonsense: true })

    act(() => result.current.submit('rag topic'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.kind).toBe('malformed_response')
  })

  it('keeps the previous results visible when the query is edited after a search, until submitted again', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()
    act(() => result.current.submit('rag topic'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    const previousResult = result.current.result

    // Editing the box (including clearing it entirely) must not touch the
    // still-displayed results — only clear() (Escape) or a new submit() may.
    act(() => result.current.setQuery(''))
    expect(result.current.status).toBe('success')
    expect(result.current.result).toBe(previousResult)

    act(() => result.current.setQuery('something else entirely'))
    expect(result.current.status).toBe('success')
    expect(result.current.result).toBe(previousResult)
  })

  it('clear() (Escape) resets the query and results back to idle', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()
    act(() => result.current.submit('rag topic'))
    await waitFor(() => expect(result.current.status).toBe('success'))

    act(() => result.current.clear())
    expect(result.current.status).toBe('idle')
    expect(result.current.result).toBeNull()
    expect(result.current.query).toBe('')
  })

  it('resubmitting the exact same query that already succeeded makes no additional API request', async () => {
    const { result } = renderHook(() => useConversationSearch('proj-1'))
    mockFetchSuccess()
    act(() => result.current.submit('rag topic'))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetch).toHaveBeenCalledTimes(1)

    act(() => result.current.submit('rag topic'))
    act(() => result.current.submit('  RAG Topic  ')) // same query, different casing/whitespace
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is no active project', async () => {
    const { result } = renderHook(() => useConversationSearch(null))
    vi.stubGlobal('fetch', vi.fn())
    act(() => result.current.submit('rag topic'))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })
})
