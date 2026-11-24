import { describe, it, expect } from 'vitest'
import { isValidHttpUrl, toSafeSearchResponse } from './sanitize'

describe('isValidHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidHttpUrl('https://chatgpt.com/c/abc')).toBe(true)
    expect(isValidHttpUrl('http://localhost:3000')).toBe(true)
  })

  it('rejects javascript: and data: URLs', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects non-strings, empty strings, and unparseable values', () => {
    expect(isValidHttpUrl(undefined)).toBe(false)
    expect(isValidHttpUrl(null)).toBe(false)
    expect(isValidHttpUrl(42)).toBe(false)
    expect(isValidHttpUrl('')).toBe(false)
    expect(isValidHttpUrl('not a url')).toBe(false)
  })
})

const baseResult = {
  conversation_id: 'c1',
  title: 'RAG Chunking',
  chat_url: 'https://chatgpt.com/c/1',
  provider: 'chatgpt',
  relevance_score: 3.7,
  summary: null,
  top_relevant_snippets: ['some snippet text'],
}

describe('toSafeSearchResponse', () => {
  it('passes a well-formed response through unchanged (not degraded)', () => {
    const safe = toSafeSearchResponse({
      query_used: 'RAG',
      corrective_triggered: false,
      chunks_indexed: 10,
      total_conversations: 1,
      conversations: [baseResult],
    })
    expect(safe).not.toBeNull()
    expect(safe!.degraded).toBe(false)
    expect(safe!.conversations).toHaveLength(1)
    expect(safe!.conversations[0]).toMatchObject({
      conversationId: 'c1',
      title: 'RAG Chunking',
      chatUrl: 'https://chatgpt.com/c/1',
      provider: 'chatgpt',
      relevanceScore: 3.7,
    })
  })

  it('returns null for a non-object payload', () => {
    expect(toSafeSearchResponse(null)).toBeNull()
    expect(toSafeSearchResponse('a string')).toBeNull()
    expect(toSafeSearchResponse(42)).toBeNull()
  })

  it('returns null when conversations is not an array', () => {
    expect(toSafeSearchResponse({ conversations: 'not-an-array' })).toBeNull()
    expect(toSafeSearchResponse({})).toBeNull()
  })

  it('defaults a missing title to "Untitled Conversation" and flags degraded', () => {
    const safe = toSafeSearchResponse({
      conversations: [{ ...baseResult, title: '' }],
    })
    expect(safe!.conversations[0].title).toBe('Untitled Conversation')
    expect(safe!.degraded).toBe(true)
  })

  it('nulls out an invalid chat_url instead of rendering a broken link, and flags degraded', () => {
    const safe = toSafeSearchResponse({
      conversations: [{ ...baseResult, chat_url: 'javascript:alert(1)' }],
    })
    expect(safe!.conversations[0].chatUrl).toBeNull()
    expect(safe!.degraded).toBe(true)
  })

  it('drops a conversation entry with no conversation_id rather than fabricating a key', () => {
    const safe = toSafeSearchResponse({
      conversations: [{ ...baseResult, conversation_id: undefined }],
    })
    expect(safe!.conversations).toHaveLength(0)
    expect(safe!.degraded).toBe(true)
  })

  it('filters corrupted (non-string) entries out of top_relevant_snippets', () => {
    const safe = toSafeSearchResponse({
      conversations: [{ ...baseResult, top_relevant_snippets: ['good', 42, null, 'also good'] }],
    })
    expect(safe!.conversations[0].snippets).toEqual(['good', 'also good'])
    expect(safe!.degraded).toBe(true)
  })

  it('caps an absurdly long snippets array defensively', () => {
    const many = Array.from({ length: 500 }, (_, i) => `snippet ${i}`)
    const safe = toSafeSearchResponse({ conversations: [{ ...baseResult, top_relevant_snippets: many }] })
    expect(safe!.conversations[0].snippets.length).toBeLessThanOrEqual(20)
  })

  it('handles a totally empty conversations array as a valid zero-result response', () => {
    const safe = toSafeSearchResponse({
      query_used: 'RAG',
      corrective_triggered: false,
      chunks_indexed: 0,
      total_conversations: 0,
      conversations: [],
    })
    expect(safe!.conversations).toEqual([])
    expect(safe!.totalConversations).toBe(0)
    expect(safe!.degraded).toBe(false)
  })

  it('sanitizes suggestions when present, dropping related-conversation entries with no id', () => {
    const safe = toSafeSearchResponse({
      conversations: [],
      suggestions: {
        closest_topics: ['RAG', 42, ''],
        closest_technologies: ['ChromaDB'],
        related_conversations: [
          { title: 'A', conversation_id: 'c1', match_type: 'fuzzy_title' },
          { title: 'B', conversation_id: '', match_type: 'semantic' },
        ],
        closest_projects: ['Other Project'],
      },
    })
    expect(safe!.suggestions).toEqual({
      closestTopics: ['RAG'],
      closestTechnologies: ['ChromaDB'],
      relatedConversations: [{ title: 'A', conversationId: 'c1', matchType: 'fuzzy_title' }],
      closestProjects: ['Other Project'],
    })
  })

  it('leaves suggestions null when absent', () => {
    const safe = toSafeSearchResponse({ conversations: [] })
    expect(safe!.suggestions).toBeNull()
  })

  it('falls back total_conversations to the sanitized array length when missing', () => {
    const safe = toSafeSearchResponse({ conversations: [baseResult] })
    expect(safe!.totalConversations).toBe(1)
  })

  it('defaults provider to "unknown" and flags degraded when absent', () => {
    const safe = toSafeSearchResponse({ conversations: [{ ...baseResult, provider: undefined }] })
    expect(safe!.conversations[0].provider).toBe('unknown')
    expect(safe!.degraded).toBe(true)
  })

  it('parses a valid captured_at into epoch ms, and null for garbage', () => {
    const safeGood = toSafeSearchResponse({
      conversations: [{ ...baseResult, captured_at: '2026-01-15T10:00:00Z' }],
    })
    expect(safeGood!.conversations[0].capturedAt).toBe(Date.parse('2026-01-15T10:00:00Z'))

    const safeBad = toSafeSearchResponse({
      conversations: [{ ...baseResult, captured_at: 'not-a-date' }],
    })
    expect(safeBad!.conversations[0].capturedAt).toBeNull()
  })
})
