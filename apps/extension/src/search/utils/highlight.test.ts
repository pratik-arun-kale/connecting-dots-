import { describe, it, expect } from 'vitest'
import { extractHighlightTerms, highlightText } from './highlight'

describe('extractHighlightTerms', () => {
  it('lowercases and dedupes terms', () => {
    expect(extractHighlightTerms('RAG rag Chunking')).toEqual(['rag', 'chunking'])
  })

  it('drops single-character tokens', () => {
    expect(extractHighlightTerms('a RAG b')).toEqual(['rag'])
  })

  it('returns an empty array for an empty/whitespace query', () => {
    expect(extractHighlightTerms('')).toEqual([])
    expect(extractHighlightTerms('   ')).toEqual([])
  })
})

describe('highlightText', () => {
  it('marks matched terms and leaves the rest untouched, case-insensitively', () => {
    const segments = highlightText('We discussed RAG chunking strategies', 'rag chunking')
    const matchedTexts = segments.filter(s => s.matched).map(s => s.text)
    expect(matchedTexts).toEqual(['RAG', 'chunking'])
    // Full text is preserved when segments are rejoined.
    expect(segments.map(s => s.text).join('')).toBe('We discussed RAG chunking strategies')
  })

  it('returns the whole text as one unmatched segment when the query has no usable terms', () => {
    const segments = highlightText('hello world', '')
    expect(segments).toEqual([{ text: 'hello world', matched: false }])
  })

  it('handles regex special characters in the query without throwing', () => {
    expect(() => highlightText('cost is $5 (approx)', '$5 (approx)')).not.toThrow()
  })

  it('handles an empty snippet text gracefully', () => {
    expect(highlightText('', 'rag')).toEqual([{ text: '', matched: false }])
  })

  it('does not highlight partial-word substrings differently than whole words (documented current behavior)', () => {
    // "rag" matches inside "fragrance" too — acceptable for a lightweight
    // client-side highlighter; the backend's topic extraction is what
    // determines relevance, this only affects visual emphasis.
    const segments = highlightText('fragrance', 'rag')
    expect(segments.some(s => s.matched)).toBe(false) // whole-token split means "fragrance" isn't split into "f" + "rag" + "rance"
  })
})
