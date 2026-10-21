import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HighlightedText } from './HighlightedText'

describe('HighlightedText', () => {
  it('renders matched terms inside <mark> elements', () => {
    render(<HighlightedText text="We discussed RAG chunking" query="rag" />)
    const mark = screen.getByText('RAG')
    expect(mark.tagName).toBe('MARK')
  })

  it('renders a snippet containing HTML-like text as literal text, not markup (XSS safety)', () => {
    const malicious = '<img src=x onerror=alert(1)> and <script>alert(2)</script>'
    render(<HighlightedText text={malicious} query="alert" />)
    // If this were ever interpreted as HTML, there would be an <img> or <script> element in the DOM.
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    // The "alert" tokens get wrapped in <mark> (matched query term), so the
    // raw string is split across sibling text nodes — check the container's
    // combined textContent instead of a single getByText match.
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)> and <script>alert(2)</script>')
  })

  it('renders the full text with no highlighting when the query is empty', () => {
    render(<HighlightedText text="plain text here" query="" />)
    expect(screen.getByText('plain text here')).toBeInTheDocument()
    expect(document.querySelector('mark')).toBeNull()
  })
})
