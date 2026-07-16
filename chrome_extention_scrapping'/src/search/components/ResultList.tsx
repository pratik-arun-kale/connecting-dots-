import { useState } from 'react'
import { ResultCard } from './ResultCard'
import type { SafeConversationResult } from '../types'

const VIRTUALIZE_THRESHOLD = 20 // below this, just render everything — no windowing overhead needed
const ESTIMATED_ROW_HEIGHT = 168 // px — rough average card height including gap; used only for windowing math
const OVERSCAN = 4
const VIEWPORT_HEIGHT = 420 // must match the container's max-height below

interface ResultListProps {
  results: SafeConversationResult[]
  query: string
  selectedIndex: number
  registerItemRef: (index: number) => (el: HTMLDivElement | null) => void
  onSelect: (index: number) => void
}

/**
 * The backend caps a single response at 50 conversations (top_k <= 50), so
 * true virtualization is rarely load-bearing in practice — but a malformed
 * or unexpectedly large payload shouldn't be able to force the extension to
 * render an unbounded number of DOM nodes, so windowing kicks in above
 * VIRTUALIZE_THRESHOLD regardless of what the backend is supposed to send.
 * This is a lightweight, dependency-free windower (fixed ESTIMATED_ROW_HEIGHT
 * for scroll math + spacer divs) rather than react-window — accurate enough
 * given cards have a fairly narrow height range in practice, and avoids
 * pulling in a measurement/ResizeObserver-based library for a case the API
 * contract makes rare.
 */
export function ResultList({ results, query, selectedIndex, registerItemRef, onSelect }: ResultListProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const shouldVirtualize = results.length > VIRTUALIZE_THRESHOLD

  let startIndex = 0
  let endIndex = results.length
  if (shouldVirtualize) {
    startIndex = Math.max(0, Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT) - OVERSCAN)
    endIndex = Math.min(results.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ESTIMATED_ROW_HEIGHT) + OVERSCAN)
  }

  const visible = results.slice(startIndex, endIndex)
  const topSpacer = shouldVirtualize ? startIndex * ESTIMATED_ROW_HEIGHT : 0
  const bottomSpacer = shouldVirtualize ? (results.length - endIndex) * ESTIMATED_ROW_HEIGHT : 0

  return (
    <div
      role="listbox"
      aria-label="Search results"
      aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
      className="max-h-[420px] overflow-y-auto space-y-2 pr-1 scroll-hide"
      onScroll={shouldVirtualize ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
    >
      {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden="true" />}
      {visible.map((result, i) => {
        const index = startIndex + i
        return (
          <div key={result.conversationId} id={`search-result-${index}`}>
            <ResultCard
              result={result}
              query={query}
              selected={index === selectedIndex}
              registerRef={registerItemRef(index)}
              onSelect={() => onSelect(index)}
            />
          </div>
        )
      })}
      {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden="true" />}
    </div>
  )
}
