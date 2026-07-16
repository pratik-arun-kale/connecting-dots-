/**
 * src/search/utils/highlight.ts
 * ───────────────────────────────────
 * Splits snippet text into plain-text segments marked matched/unmatched
 * against the query terms actually used for retrieval. Returns DATA, not
 * markup — components/HighlightedText.tsx renders each segment as a plain
 * React text node (a <mark> or a <span>), so there is no HTML parsing of
 * backend-controlled text anywhere in this path. That's what makes it
 * XSS-safe by construction rather than by remembering to escape something.
 */

export interface TextSegment {
  text: string
  matched: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Word-ish tokens only (>=2 chars) — skip stray punctuation/single letters so we don't highlight "a" or "?" everywhere. */
export function extractHighlightTerms(query: string): string[] {
  const tokens = query.match(/[\p{L}\p{N}]+/gu) ?? []
  return Array.from(new Set(tokens.filter(t => t.length >= 2).map(t => t.toLowerCase())))
}

export function highlightText(text: string, query: string): TextSegment[] {
  const terms = extractHighlightTerms(query)
  if (terms.length === 0 || !text) return [{ text, matched: false }]

  // \b word boundaries so "rag" doesn't light up inside "fragrance" — this is
  // purely visual emphasis, and mid-word matches read as a rendering bug.
  const pattern = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'gi')
  const parts = text.split(pattern)

  const lowerTerms = new Set(terms)
  return parts
    .filter(part => part.length > 0)
    .map(part => ({ text: part, matched: lowerTerms.has(part.toLowerCase()) }))
}
