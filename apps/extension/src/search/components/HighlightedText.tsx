import { highlightText } from '../utils/highlight'

interface HighlightedTextProps {
  text: string
  query: string
  className?: string
}

/**
 * Renders `text` as plain React text nodes, wrapping matched query terms in
 * <mark>. This NEVER uses dangerouslySetInnerHTML — highlightText() returns
 * plain-string segments, so a snippet containing e.g. "<script>" is rendered
 * as the literal text "<script>", not parsed as markup. `whitespace-pre-wrap`
 * preserves embedded newlines/spacing in multiline snippets.
 */
export function HighlightedText({ text, query, className }: HighlightedTextProps) {
  const segments = highlightText(text, query)
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {segments.map((seg, i) =>
        seg.matched ? (
          <mark
            key={i}
            className="bg-accent/20 text-accent dark:bg-accent/30 dark:text-[#5eb1ff] rounded-[3px] px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}
