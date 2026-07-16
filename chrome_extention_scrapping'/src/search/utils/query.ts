/**
 * src/search/utils/query.ts
 * ───────────────────────────────────
 * Query-string normalization shared by the cache (key derivation) and the
 * in-flight request dedup map. Deliberately dumb — this is NOT the backend's
 * topic-centric query understanding (see Backend context-workspace's
 * topic_extractor.py); it only needs to recognize when two strings are "the
 * same request" from the client's point of view (whitespace/case differences),
 * not when they mean the same *topic*. Real query understanding stays
 * server-side, per the "reuse only the existing endpoint" constraint.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

export const MIN_QUERY_LENGTH = 3 // matches ConversationSearchRequest.query min_length on the backend

export function isSearchableQuery(raw: string): boolean {
  return normalizeQuery(raw).length >= MIN_QUERY_LENGTH
}
