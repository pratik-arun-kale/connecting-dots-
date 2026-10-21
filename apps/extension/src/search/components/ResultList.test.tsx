import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultList } from './ResultList'
import type { SafeConversationResult } from '../types'

function makeResults(count: number): SafeConversationResult[] {
  return Array.from({ length: count }, (_, i) => ({
    conversationId: `c${i}`,
    title: `Conversation ${i}`,
    chatUrl: `https://chatgpt.com/c/${i}`,
    provider: 'chatgpt',
    relevanceScore: 1,
    summary: null,
    snippets: [`snippet for conversation ${i}`],
    capturedAt: null,
  }))
}

describe('ResultList', () => {
  it('renders every result when the count is below the virtualization threshold', () => {
    const results = makeResults(5)
    render(
      <ResultList results={results} query="" selectedIndex={-1} registerItemRef={() => () => {}} onSelect={vi.fn()} />,
    )
    expect(screen.getAllByRole('option')).toHaveLength(5)
  })

  it('does not crash and bounds DOM node count for a 1000+ result set', () => {
    const results = makeResults(1200)
    render(
      <ResultList results={results} query="" selectedIndex={-1} registerItemRef={() => () => {}} onSelect={vi.fn()} />,
    )
    const rendered = screen.getAllByRole('option')
    // Windowed: nowhere near all 1200 cards should be in the DOM at once.
    expect(rendered.length).toBeLessThan(100)
    expect(rendered.length).toBeGreaterThan(0)
  })

  it('marks the selected result with aria-selected and sets aria-activedescendant', () => {
    const results = makeResults(3)
    render(
      <ResultList results={results} query="" selectedIndex={1} registerItemRef={() => () => {}} onSelect={vi.fn()} />,
    )
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveAttribute('aria-activedescendant', 'search-result-1')
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('renders an empty listbox without error when results is empty', () => {
    render(<ResultList results={[]} query="" selectedIndex={-1} registerItemRef={() => () => {}} onSelect={vi.fn()} />)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('invokes onSelect with the clicked result index', async () => {
    const onSelect = vi.fn()
    const results = makeResults(3)
    render(
      <ResultList results={results} query="" selectedIndex={-1} registerItemRef={() => () => {}} onSelect={onSelect} />,
    )
    screen.getAllByRole('option')[2].click()
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
