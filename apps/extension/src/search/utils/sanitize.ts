/**
 * src/search/utils/sanitize.ts
 * ───────────────────────────────────
 * The single choke point between "what the network handed us" and "what
 * components are allowed to trust". Every field is defaulted defensively —
 * this file NEVER throws on bad input, because a malformed field (missing
 * title, corrupted snippet, absent URL) is exactly the kind of partial
 * backend response the spec requires we survive without crashing.
 *
 * This is also the XSS boundary: everything here produces plain strings.
 * Nothing in the render layer ever uses dangerouslySetInnerHTML, so a
 * malicious string in a title/snippet can only ever be React-escaped text —
 * never live HTML. See components/HighlightedText.tsx for the same
 * guarantee applied to the highlighted-match rendering path.
 */
import type {
  RawConversationSearchResponse,
  RawConversationSearchResult,
  RawSearchSuggestions,
  SafeConversationResult,
  SafeSearchResponse,
  SafeSearchSuggestions,
} from '../types'

const MAX_SNIPPETS_PER_RESULT = 20 // defensive cap — a corrupted payload shouldn't be able to force unbounded rendering

/** Only http/https URLs are ever considered valid — rules out javascript:, data:, etc. */
export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeOneResult(raw: unknown): { result: SafeConversationResult; degraded: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<RawConversationSearchResult>
  let degraded = false

  const conversationId = typeof r.conversation_id === 'string' && r.conversation_id ? r.conversation_id : null
  if (!conversationId) return null // no stable key to render/select by — drop it rather than fake one

  let title = typeof r.title === 'string' ? r.title.trim() : ''
  if (!title) {
    title = 'Untitled Conversation'
    degraded = true
  }

  let chatUrl: string | null = null
  if (isValidHttpUrl(r.chat_url)) {
    chatUrl = r.chat_url as string
  } else if (r.chat_url != null) {
    degraded = true // present but invalid — worth flagging, distinct from "just absent"
  }

  const provider = typeof r.provider === 'string' && r.provider ? r.provider : 'unknown'
  if (provider === 'unknown') degraded = true

  const relevanceScore = typeof r.relevance_score === 'number' && Number.isFinite(r.relevance_score)
    ? r.relevance_score
    : 0

  const summary = typeof r.summary === 'string' && r.summary.trim() ? r.summary : null

  let snippets: string[] = []
  if (Array.isArray(r.top_relevant_snippets)) {
    const cleaned = r.top_relevant_snippets.filter((s): s is string => typeof s === 'string' && s.length > 0)
    if (cleaned.length !== r.top_relevant_snippets.length) degraded = true
    snippets = cleaned.slice(0, MAX_SNIPPETS_PER_RESULT)
  } else if (r.top_relevant_snippets != null) {
    degraded = true
  }

  let capturedAt: number | null = null
  if (typeof r.captured_at === 'string') {
    const parsed = Date.parse(r.captured_at)
    capturedAt = Number.isNaN(parsed) ? null : parsed
  }

  return {
    degraded,
    result: {
      conversationId,
      title,
      chatUrl,
      provider,
      relevanceScore,
      summary,
      snippets,
      capturedAt,
    },
  }
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
}

function sanitizeSuggestions(raw: unknown): SafeSearchSuggestions | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<RawSearchSuggestions>

  const relatedConversations = Array.isArray(r.related_conversations)
    ? r.related_conversations
      .filter((item): item is NonNullable<typeof item> => typeof item === 'object' && item !== null)
      .map(item => ({
        title: typeof item.title === 'string' && item.title ? item.title : 'Untitled Conversation',
        conversationId: typeof item.conversation_id === 'string' ? item.conversation_id : '',
        matchType: typeof item.match_type === 'string' ? item.match_type : 'unknown',
      }))
      .filter(item => item.conversationId.length > 0)
    : []

  return {
    closestTopics: sanitizeStringArray(r.closest_topics),
    closestTechnologies: sanitizeStringArray(r.closest_technologies),
    relatedConversations,
    closestProjects: sanitizeStringArray(r.closest_projects),
  }
}

/**
 * Turn an arbitrary network payload into a `SafeSearchResponse`. Returns
 * `null` only if the payload is so malformed there's nothing salvageable
 * (not an object, or `conversations` isn't an array) — the caller treats
 * that as a `malformed_response` SearchError, distinct from "zero results".
 */
export function toSafeSearchResponse(raw: unknown): SafeSearchResponse | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<RawConversationSearchResponse>
  if (!Array.isArray(r.conversations)) return null

  let degraded = false
  const conversations: SafeConversationResult[] = []
  for (const item of r.conversations) {
    const sanitized = sanitizeOneResult(item)
    if (!sanitized) {
      degraded = true
      continue
    }
    if (sanitized.degraded) degraded = true
    conversations.push(sanitized.result)
  }

  const totalConversations = typeof r.total_conversations === 'number' && Number.isFinite(r.total_conversations)
    ? r.total_conversations
    : conversations.length
  if (totalConversations !== r.total_conversations) degraded = degraded || r.total_conversations !== undefined

  const queryUsed = typeof r.query_used === 'string' ? r.query_used : ''
  const correctiveTriggered = typeof r.corrective_triggered === 'boolean' ? r.corrective_triggered : false
  const suggestions = r.suggestions != null ? sanitizeSuggestions(r.suggestions) : null

  return {
    queryUsed,
    correctiveTriggered,
    totalConversations,
    conversations,
    suggestions,
    degraded,
  }
}
