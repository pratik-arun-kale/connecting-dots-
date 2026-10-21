/**
 * src/search/api/searchClient.ts
 * ───────────────────────────────────
 * Thin, typed wrapper around a single endpoint: POST /search/conversations.
 * This is the ONLY place in the extension that knows that URL — per the
 * task constraint, it reuses the existing backend retrieval endpoint and
 * implements no search/ranking logic of its own; it only transports a
 * request and validates/sanitizes the response.
 *
 * Two abort signals are in play, deliberately kept distinct:
 *  - `externalSignal` (from the caller/hook): aborts because a NEWER request
 *    superseded this one (fast typing) or the component unmounted. Bubbled
 *    to the caller as a raw AbortError — the hook treats that as "ignore
 *    silently", per the "ignore stale responses" requirement.
 *  - the internal timeout controller: aborts because the deadline elapsed.
 *    Surfaced as a typed `TimeoutError`, which IS shown to the user (with a
 *    retry button), because it's actionable in a way a superseded request
 *    isn't.
 * Collapsing these into one signal would make a slow-backend timeout
 * indistinguishable from "the user kept typing", which is the wrong UX.
 */
import { toSafeSearchResponse } from '../utils/sanitize'
import type { SafeSearchResponse, SearchRequestParams } from '../types'
import { withAuthHeader, refreshOnce } from '@/auth/authorizedFetch'

const BASE = 'http://localhost:8000/api/v1' // matches src/lib/api.ts — same backend, same origin allowlisted in manifest host_permissions
const DEFAULT_TIMEOUT_MS = 10_000

export class HttpStatusError extends Error {
  constructor(public readonly status: number, public readonly bodyText: string) {
    super(`HTTP ${status}`)
    this.name = 'HttpStatusError'
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Search request timed out')
    this.name = 'TimeoutError'
  }
}

export class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedResponseError'
  }
}

export async function searchConversations(
  params: SearchRequestParams,
  externalSignal: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SafeSearchResponse> {
  if (externalSignal.aborted) {
    throw new DOMException('Aborted before dispatch', 'AbortError')
  }

  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
  const onExternalAbort = () => timeoutController.abort()
  externalSignal.addEventListener('abort', onExternalAbort)

  const body = JSON.stringify({
    project_id: params.projectId,
    query: params.query,
    top_k: params.topK,
  })

  try {
    let res = await fetch(
      `${BASE}/search/conversations`,
      await withAuthHeader({ method: 'POST', body, signal: timeoutController.signal }),
    )

    // One silent refresh + retry on a 401 — same token-expiry recovery as
    // every other backend call, kept inline here (rather than routed
    // through authorizedFetch()) so the timeout/external-abort signal
    // handling above stays untouched.
    if (res.status === 401) {
      const newToken = await refreshOnce(BASE)
      if (newToken) {
        res = await fetch(
          `${BASE}/search/conversations`,
          await withAuthHeader({ method: 'POST', body, signal: timeoutController.signal }),
        )
      }
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new HttpStatusError(res.status, bodyText.slice(0, 300))
    }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new MalformedResponseError('Response body was not valid JSON')
    }

    const safe = toSafeSearchResponse(json)
    if (!safe) throw new MalformedResponseError('Response did not match the expected search-result shape')
    return safe
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Our own deadline firing vs. the caller superseding/unmounting: the
      // external signal is only aborted in the latter case.
      if (externalSignal.aborted) throw err
      throw new TimeoutError()
    }
    throw err
  } finally {
    clearTimeout(timer)
    externalSignal.removeEventListener('abort', onExternalAbort)
  }
}
