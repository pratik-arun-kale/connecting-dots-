import { useState } from 'react'
import { cn, formatRelative } from '@/lib/utils'
import { PLATFORM_DEFS, type PlatformId } from '@/types/platform'
import { HighlightedText } from './HighlightedText'
import { openChatUrl } from '../utils/openChat'
import type { SafeConversationResult } from '../types'

interface ResultCardProps {
  result: SafeConversationResult
  query: string
  selected: boolean
  registerRef: (el: HTMLDivElement | null) => void
  onSelect: () => void
}

const SNIPPET_PREVIEW_COUNT = 1

function providerBadge(provider: string) {
  const def = PLATFORM_DEFS[provider as PlatformId]
  return {
    label: def?.label ?? (provider === 'unknown' ? 'Unknown source' : provider),
    color: def?.color ?? '#8e8e93',
  }
}

export function ResultCard({ result, query, selected, registerRef, onSelect }: ResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [openError, setOpenError] = useState<string | null>(null)

  const badge = providerBadge(result.provider)
  const visibleSnippets = expanded ? result.snippets : result.snippets.slice(0, SNIPPET_PREVIEW_COUNT)
  const remaining = result.snippets.length - SNIPPET_PREVIEW_COUNT

  const handleOpenChat = () => {
    const outcome = openChatUrl(result.chatUrl)
    setOpenError(outcome.ok ? null : outcome.message)
  }

  const handleCopyUrl = async () => {
    if (!result.chatUrl) {
      setOpenError('This conversation has no valid link to copy.')
      return
    }
    try {
      await navigator.clipboard.writeText(result.chatUrl)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 1500)
    }
  }

  return (
    <div
      ref={registerRef}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        'rounded-lg border p-3 space-y-2 cursor-default transition-colors',
        selected
          ? 'border-accent/50 bg-accent/[0.04] dark:bg-accent/[0.08]'
          : 'border-surface-5/60 bg-white dark:border-white/10 dark:bg-[#1c1c1e]',
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-2xs font-semibold px-1.5 py-0.5 rounded shrink-0 text-white"
            style={{ backgroundColor: badge.color }}
          >
            {badge.label}
          </span>
          <span className="text-sm font-medium text-ink-1 dark:text-white truncate">
            {result.title}
          </span>
        </div>
        <span className="text-2xs font-mono text-ink-4 dark:text-white/40 shrink-0">
          {result.relevanceScore.toFixed(2)}
        </span>
      </div>

      {/* Summary */}
      {result.summary && (
        <p className="text-xs text-ink-3 dark:text-white/60 italic line-clamp-2">{result.summary}</p>
      )}

      {/* Captured date — only shown if the backend ever supplies it */}
      {result.capturedAt !== null && (
        <p className="text-2xs text-ink-4 dark:text-white/40">
          Captured {formatRelative(result.capturedAt)}
        </p>
      )}

      {/* Snippets */}
      {visibleSnippets.length > 0 && (
        <div className="space-y-1.5">
          {visibleSnippets.map((snippet, i) => (
            <div
              key={i}
              className="text-xs text-ink-2 dark:text-white/70 leading-relaxed border-l-2 border-surface-5 dark:border-white/15 pl-2 line-clamp-3"
            >
              <HighlightedText text={snippet} query={query} />
            </div>
          ))}
        </div>
      )}
      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setExpanded(true) }}
          className="text-2xs font-medium text-accent hover:underline cursor-pointer"
        >
          Show {remaining} more
        </button>
      )}
      {expanded && result.snippets.length > SNIPPET_PREVIEW_COUNT && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setExpanded(false) }}
          className="text-2xs font-medium text-ink-4 dark:text-white/40 hover:underline cursor-pointer"
        >
          Show less
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); handleOpenChat() }}
          disabled={!result.chatUrl}
          className="text-2xs font-medium text-accent hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
        >
          Open Original Chat
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); void handleCopyUrl() }}
          disabled={!result.chatUrl}
          className="text-2xs font-medium text-ink-3 dark:text-white/50 hover:text-ink-1 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy URL'}
        </button>
      </div>

      {openError && (
        <p role="alert" className="text-2xs text-red-600 dark:text-red-400">{openError}</p>
      )}
    </div>
  )
}
