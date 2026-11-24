/**
 * src/search/hooks/useConversationSearch.ts
 * ───────────────────────────────────
 * Orchestrates one search box's entire lifecycle: explicit-submit dispatch,
 * cache lookup, in-flight-request dedup, cancellation of superseded
 * requests, stale-response rejection, and error classification.
 *
 * STATE SEPARATION: the spec asks that UI/Search/Network/Cache/Loading/
 * Error/Selection state not be mixed together. Selection state lives
 * entirely in a different hook (useResultSelection) because it's orthogonal
 * — it only knows about an array and an index, never about the network.
 * UI state (section collapsed, per-card snippet-expanded) is local
 * component `useState` right where it's rendered, because nothing outside
 * that component reads it. What's left — search/network/loading/error/cache
 * — all change together as a consequence of ONE state machine (a single
 * search request), so they're deliberately kept in one hook with clearly
 * separated, distinctly-named fields on the return object rather than
 * splintered into hooks that would just have to be re-glued by every
 * consumer.
 *
 * DEDUP / CANCEL / STALE, concretely:
 *  - `requestIdRef` — a monotonic counter. A response is only applied to
 *    state if its requestId is still the latest one issued; anything older
 *    is a stale response and is silently discarded (covers races where an
 *    aborted fetch's promise still resolves).
 *  - `abortControllerRef` — the in-flight request's controller. Starting a
 *    new request aborts whatever was previous (only relevant now if a retry
 *    or a second explicit submit fires while one is still in flight).
 *  - `inFlightKeyRef` — sourced from the cache key. If a dispatch's key
 *    matches the key already in flight, it's skipped outright rather than
 *    starting a second identical fetch (covers Enter-mashing / an example
 *    chip clicked twice before the first response lands).
 *
 * EXPLICIT SUBMIT ONLY: typing (`setQuery`) never triggers a search — it
 * only updates the `query` state so the input reflects what's typed. A
 * search only happens via `submit()`, wired to Enter and the search button
 * (see SearchPreviousConversations.tsx). This also means editing the query
 * after a search leaves the previous `result`/`status` untouched until the
 * next submit — exactly the "keep previous results visible" requirement,
 * for free, because nothing in `setQuery` touches result state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { searchConversations, HttpStatusError, TimeoutError, MalformedResponseError } from '../api/searchClient'
import { buildCacheKey, searchResultCache } from '../cache/searchCache'
import { isSearchableQuery, normalizeQuery } from '../utils/query'
import { classifyHttpStatus, classifyThrown, buildSearchError } from '../utils/classifyError'
import { searchAnalytics } from '../utils/analytics'
import type { SafeSearchResponse, SearchError, SearchStatus } from '../types'

const DEFAULT_TOP_K = 15

export interface UseConversationSearchOptions {
  topK?: number
}

export function useConversationSearch(projectId: string | null, options: UseConversationSearchOptions = {}) {
  const topK = options.topK ?? DEFAULT_TOP_K

  // ── Search State ────────────────────────────────────────────────────────
  const [query, setQueryState] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null)

  // ── Network / Loading / Error / Result state ─────────────────────────────
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [result, setResult] = useState<SafeSearchResponse | null>(null)
  const [error, setError] = useState<SearchError | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false)

  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const inFlightKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const runSearch = useCallback((rawQuery: string) => {
    if (!projectId) return
    if (!isSearchableQuery(rawQuery)) return

    const key = buildCacheKey(projectId, rawQuery, topK)

    // Cache hit — serve instantly, no network round trip, no dedup bookkeeping needed.
    const cached = searchResultCache.get(key)
    if (cached) {
      abortControllerRef.current?.abort()
      requestIdRef.current += 1
      setSubmittedQuery(rawQuery)
      setStatus('success')
      setResult(cached)
      setFromCache(true)
      setError(null)
      searchAnalytics.recordSuccess(0, cached.conversations.length, true)
      return
    }

    // Duplicate in-flight request for the exact same key — skip, the
    // already-running request will populate state when it lands.
    if (inFlightKeyRef.current === key) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSubmittedQuery(rawQuery)
      setStatus('error')
      setResult(null)
      setFromCache(false)
      setError(buildSearchError('offline'))
      searchAnalytics.recordFailure('offline')
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    inFlightKeyRef.current = key

    const requestId = ++requestIdRef.current
    setSubmittedQuery(rawQuery)
    setStatus('loading')
    setError(null)
    setFromCache(false)
    searchAnalytics.recordSearchStart(rawQuery)
    const startedAt = performance.now()

    searchConversations({ projectId, query: rawQuery, topK }, controller.signal)
      .then(response => {
        if (requestIdRef.current !== requestId) return // stale — a newer request already superseded this one
        searchResultCache.set(key, response)
        setStatus('success')
        setResult(response)
        setFromCache(false)
        searchAnalytics.recordSuccess(performance.now() - startedAt, response.conversations.length, false)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return // stale — ignore

        if (err instanceof DOMException && err.name === 'AbortError') {
          // Superseded by a newer request, or the component unmounted — not a
          // user-facing failure. requestIdRef already guarantees a genuinely
          // newer request won't be clobbered by this branch.
          searchAnalytics.recordCancelled()
          return
        }

        let classified: SearchError
        if (err instanceof TimeoutError) classified = buildSearchError('timeout')
        else if (err instanceof HttpStatusError) classified = buildSearchError(classifyHttpStatus(err.status), err.bodyText)
        else if (err instanceof MalformedResponseError) classified = buildSearchError('malformed_response', err.message)
        else classified = classifyThrown(err)

        setStatus('error')
        setResult(null)
        setError(classified)
        searchAnalytics.recordFailure(classified.kind, classified.detail)
      })
      .finally(() => {
        if (inFlightKeyRef.current === key) inFlightKeyRef.current = null
      })
  }, [projectId, topK])

  const resetToIdle = useCallback(() => {
    abortControllerRef.current?.abort()
    requestIdRef.current += 1
    setStatus('idle')
    setResult(null)
    setError(null)
    setFromCache(false)
    setSubmittedQuery(null)
  }, [])

  /** Typing only — never triggers a search. See module docstring. */
  const setQuery = useCallback((raw: string) => {
    setQueryState(raw)
  }, [])

  /**
   * The only way a search actually runs: Enter or the search button/icon
   * (see SearchPreviousConversations.tsx), or an example/suggestion chip
   * passing its own text. Resubmitting the exact same query that already
   * succeeded is a deliberate no-op — not just "served from cache" but
   * skipped before even touching state, per the "if the query is unchanged
   * from the previous successful search, do not make another API request"
   * requirement.
   */
  const submit = useCallback((rawQuery?: string) => {
    const q = rawQuery ?? query
    if (rawQuery !== undefined) setQueryState(rawQuery)
    if (status === 'success' && normalizeQuery(q) === normalizeQuery(submittedQuery ?? '')) return
    runSearch(q)
  }, [query, runSearch, status, submittedQuery])

  const retry = useCallback(() => {
    if (submittedQuery) runSearch(submittedQuery)
  }, [submittedQuery, runSearch])

  const clear = useCallback(() => {
    inFlightKeyRef.current = null
    setQueryState('')
    resetToIdle()
  }, [resetToIdle])

  // Cancel any in-flight request on unmount — no state update after unmount, no leaked request.
  useEffect(() => () => { abortControllerRef.current?.abort() }, [])

  return {
    // Search State
    query,
    setQuery,
    submittedQuery,
    // Network / Loading State
    status,
    isLoading: status === 'loading',
    isOffline,
    // Result
    result,
    fromCache,
    // Error State
    error,
    // Actions
    submit,
    retry,
    clear,
  }
}
