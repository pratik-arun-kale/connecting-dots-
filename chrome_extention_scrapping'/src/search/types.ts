/**
 * src/search/types.ts
 * ───────────────────────────────────
 * All types for the "Search Previous Conversations" feature, in one place
 * so the API contract (what the backend actually promises) is visually
 * separate from the defensive, always-safe shape the UI is allowed to trust
 * (`SafeConversationResult`). Nothing outside src/search should need to
 * import backend response shapes directly — go through `sanitize.ts`.
 */

// ── Backend contract (POST /search/conversations) ───────────────────────────
// Mirrors Backend context-workspace/app/schemas/search.py exactly. Treated as
// UNTRUSTED at the network boundary — see sanitize.ts — because a "production
// grade" client cannot assume the server always sends well-formed JSON matching
// this shape (partial responses, backend bugs, a proxy mangling the body, etc).

export interface RawCandidateQuery {
  label: string
  query: string
  weight: number
}

export interface RawRelatedConversationSuggestion {
  title: string
  conversation_id: string
  match_type: string
}

export interface RawSearchSuggestions {
  closest_topics: string[]
  closest_technologies: string[]
  related_conversations: RawRelatedConversationSuggestion[]
  closest_projects: string[]
}

export interface RawConversationSearchResult {
  conversation_id: string
  title: string
  chat_url: string
  provider: string
  relevance_score: number
  summary: string | null
  top_relevant_snippets: string[]
  captured_at?: string | null // not yet returned by the backend; read defensively if it ever is
}

export interface RawConversationSearchResponse {
  query_used: string
  corrective_triggered: boolean
  chunks_indexed: number
  total_conversations: number
  conversations: RawConversationSearchResult[]
  candidate_queries?: RawCandidateQuery[]
  suggestions?: RawSearchSuggestions | null
}

// ── Sanitized shape (what components actually render) ───────────────────────
// Every field is guaranteed present and of the right type — see
// sanitize.ts#toSafeSearchResponse, the single choke point that produces this.

export interface SafeConversationResult {
  conversationId: string
  title: string
  /** null when the backend URL was missing/unparseable — never a broken string. */
  chatUrl: string | null
  provider: string
  relevanceScore: number
  summary: string | null
  snippets: string[]
  capturedAt: number | null // unix ms, if the backend ever supplies it
}

export interface SafeRelatedConversationSuggestion {
  title: string
  conversationId: string
  matchType: string
}

export interface SafeSearchSuggestions {
  closestTopics: string[]
  closestTechnologies: string[]
  relatedConversations: SafeRelatedConversationSuggestion[]
  closestProjects: string[]
}

export interface SafeSearchResponse {
  queryUsed: string
  correctiveTriggered: boolean
  totalConversations: number
  conversations: SafeConversationResult[]
  /** "Did you mean?" suggestions — only meaningful when conversations is empty. */
  suggestions: SafeSearchSuggestions | null
  /** true if any field in the raw payload was missing/malformed and had to be defaulted. */
  degraded: boolean
}

// ── Error classification ─────────────────────────────────────────────────────
// One flat enum the UI switches on, instead of inspecting HTTP status codes or
// exception types itself — keeps every error-shaped `if` in one place (classifyError).

export type SearchErrorKind =
  | 'offline'            // navigator.onLine === false, or a fetch-level network failure
  | 'timeout'            // request exceeded the client-side deadline
  | 'unauthorized'       // 401
  | 'forbidden'          // 403
  | 'not_found'          // 404
  | 'bad_request'        // 400 / 422 — malformed request (shouldn't happen, but don't crash)
  | 'server_error'       // 5xx
  | 'malformed_response' // 2xx but body isn't valid JSON / doesn't match the contract
  | 'cancelled'          // aborted by a newer request or unmount — not shown to the user
  | 'unknown'

export interface SearchError {
  kind: SearchErrorKind
  message: string        // human-friendly, safe to render directly
  detail?: string        // technical detail, dev-analytics / debugging only
  retryable: boolean
}

// ── Request/network lifecycle ────────────────────────────────────────────────

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

export interface SearchRequestParams {
  projectId: string
  query: string
  topK: number
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T
  expiresAt: number // epoch ms
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
}
