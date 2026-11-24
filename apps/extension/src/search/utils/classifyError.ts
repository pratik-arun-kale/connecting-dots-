/**
 * src/search/utils/classifyError.ts
 * ───────────────────────────────────
 * Single choke point turning "whatever went wrong with a fetch" into one of
 * the flat SearchErrorKinds the UI switches on. Keeps every HTTP-status /
 * exception-type `if` out of components and out of the hook.
 */
import type { SearchError, SearchErrorKind } from '../types'

export function classifyHttpStatus(status: number): SearchErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 400 || status === 422) return 'bad_request'
  if (status >= 500) return 'server_error'
  return 'unknown'
}

const MESSAGES: Record<SearchErrorKind, string> = {
  offline: "You're offline. Reconnect and try again.",
  timeout: 'The search took too long to respond. Please try again.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have access to search this project.",
  not_found: 'This project could not be found.',
  bad_request: 'That search could not be understood. Try rephrasing it.',
  server_error: 'The server ran into a problem. Please try again shortly.',
  malformed_response: 'Received an unexpected response. Please try again.',
  cancelled: '', // never surfaced to the user
  unknown: 'Something went wrong. Please try again.',
}

export function buildSearchError(kind: SearchErrorKind, detail?: string): SearchError {
  return {
    kind,
    message: MESSAGES[kind],
    detail,
    retryable: kind !== 'unauthorized' && kind !== 'forbidden' && kind !== 'not_found' && kind !== 'cancelled',
  }
}

/** Classifies a thrown value from the fetch/abort layer (network failure, abort, timeout). */
export function classifyThrown(err: unknown): SearchError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return buildSearchError('offline', String(err))
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    // Distinguish a deliberate cancel (superseded by a newer request) from a
    // client-side timeout — the caller passes a `timedOut` flag when it aborted
    // specifically because the deadline elapsed rather than because a newer
    // keystroke fired. See searchClient.ts.
    return buildSearchError('cancelled')
  }
  if (err instanceof TypeError) {
    // fetch() rejects with a TypeError for network-level failures (DNS, refused
    // connection, mixed content, CORS) — this is the "backend unavailable" case.
    return buildSearchError('offline', err.message)
  }
  const detail = err instanceof Error ? err.message : String(err)
  return buildSearchError('unknown', detail)
}
