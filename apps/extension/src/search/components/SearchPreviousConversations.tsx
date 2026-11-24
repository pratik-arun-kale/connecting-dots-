/**
 * src/search/components/SearchPreviousConversations.tsx
 * ───────────────────────────────────
 * The collapsible "Search Previous Conversations" section — Conversation
 * Discovery, not Ask AI: retrieval only, no generated answer. Mounted in the
 * side panel so it stays open alongside the ChatGPT/Claude/Gemini tab the
 * user is already on ("without leaving the current chat").
 *
 * This component is the composition root: it owns UI state (collapsed) and
 * wires together useConversationSearch (search/network/loading/error/cache
 * state) and useResultSelection (selection state) — each hook owns its own
 * slice, this component only reads from both and renders accordingly.
 */
import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useCaptureContext } from '../../popup/hooks/useCaptureContext'
import { cn } from '@/lib/utils'
import { fadeIn } from '@/lib/motion'
import { useConversationSearch } from '../hooks/useConversationSearch'
import { useResultSelection } from '../hooks/useResultSelection'
import { openChatUrl } from '../utils/openChat'
import { ResultList } from './ResultList'
import { LoadingState, OfflineState, ErrorState, EmptyState, NoConversationsIndexedState } from './SearchStates'
import type { SafeConversationResult } from '../types'

const EXAMPLE_QUERIES = ['RAG', 'FastAPI', 'NVIDIA', 'Chrome Extension']

export function SearchPreviousConversations() {
  // ── UI State (local — nothing outside this section reads it) ─────────────
  const [collapsed, setCollapsed] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeProjectId = useWorkspaceStore(s => s.activeProjectId)
  const activeProject = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId) ?? null)
  const activeProjectName = activeProject?.name ?? null
  const hasIndexedConversations = (activeProject?.contextCount ?? 0) > 0
  const { canCapture, capture } = useCaptureContext()

  const {
    query, setQuery, status, isLoading, result, error, submit, retry, clear,
  } = useConversationSearch(activeProjectId)

  const handleOpen = useCallback((r: SafeConversationResult) => {
    const outcome = openChatUrl(r.chatUrl)
    setOpenError(outcome.ok ? null : outcome.message)
  }, [])

  const conversations = result?.conversations ?? []
  const selection = useResultSelection(conversations, handleOpen)

  const handleWrapperKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      clear()
      inputRef.current?.blur()
      return
    }
    if (e.key === 'Enter' && selection.selectedIndex === -1) {
      e.preventDefault()
      submit()
      return
    }
    selection.handleKeyDown(e)
  }

  const showExamples = !!activeProjectId && status === 'idle'
  const showOfflineState = status === 'error' && error?.kind === 'offline'
  const showGenericError = status === 'error' && error != null && error.kind !== 'offline'

  return (
    <section aria-label="Search previous conversations">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        aria-controls="search-conversations-panel"
        className="w-full flex items-center justify-between px-1 mb-2 group cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-micro text-ink-4 uppercase tracking-wide">
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none" className="text-ink-4">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Search Previous Conversations
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={cn('text-ink-4 transition-transform', collapsed ? '-rotate-90' : '')}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {!collapsed && (
          <motion.div
            id="search-conversations-panel"
            variants={fadeIn}
            initial="hidden"
            animate="show"
            onKeyDown={handleWrapperKeyDown}
            className="space-y-3"
          >
            <p className="text-2xs text-ink-3 dark:text-white/50 px-1 -mt-1">
              Find where you discussed something before.
            </p>

            {!activeProjectId ? (
              <p className="text-xs text-ink-3 dark:text-white/50 px-1 py-3 text-center">
                Select a project to search its captured conversations.
              </p>
            ) : !hasIndexedConversations ? (
              <NoConversationsIndexedState onCapture={() => void capture()} canCapture={canCapture} />
            ) : (
              <>
                <div className="flex gap-1.5 items-center">
                  <div className="relative flex-1">
                    <input
                      ref={inputRef}
                      type="text"
                      role="searchbox"
                      aria-label={`Search previous conversations${activeProjectName ? ` in ${activeProjectName}` : ''}`}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search topics like RAG, NVIDIA, FastAPI…"
                      className={cn(
                        'w-full h-8 pl-3 pr-3 rounded-lg text-sm',
                        'bg-surface-2 border border-white/[0.08] text-ink-1',
                        'dark:bg-white/[0.06] dark:border-white/10 dark:text-white',
                        'placeholder:text-ink-4 dark:placeholder:text-white/30',
                        'outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
                        'transition-all duration-150',
                      )}
                    />
                  </div>
                  {/* The only two ways a search fires: this button, or Enter
                      in the input above (see handleWrapperKeyDown) — typing
                      alone never triggers a request. */}
                  <button
                    type="button"
                    onClick={() => submit()}
                    disabled={isLoading}
                    aria-label="Search"
                    title="Search"
                    className={cn(
                      'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                      'bg-accent text-white hover:bg-accent/90',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      !isLoading && 'cursor-pointer',
                    )}
                  >
                    {isLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>

                {showExamples && (
                  <div className="flex flex-wrap gap-1.5 px-0.5">
                    {EXAMPLE_QUERIES.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => submit(q)}
                        className="text-2xs px-2 py-1 rounded-full border border-surface-5 dark:border-white/15 text-ink-3 dark:text-white/60 hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {isLoading && <LoadingState />}
                {showOfflineState && <OfflineState onRetry={retry} />}
                {showGenericError && error && <ErrorState error={error} onRetry={retry} />}

                {status === 'success' && result && (
                  result.conversations.length === 0 ? (
                    <EmptyState suggestions={result.suggestions} onSuggestionClick={q => submit(q)} />
                  ) : (
                    <div className="space-y-2">
                      <p className="text-2xs font-semibold text-ink-4 dark:text-white/40 uppercase tracking-wider px-0.5" aria-live="polite">
                        {result.totalConversations} conversation{result.totalConversations === 1 ? '' : 's'} found
                      </p>
                      <ResultList
                        results={conversations}
                        query={result.queryUsed}
                        selectedIndex={selection.selectedIndex}
                        registerItemRef={selection.registerItemRef}
                        onSelect={selection.setSelectedIndex}
                      />
                    </div>
                  )
                )}

                {openError && (
                  <p role="alert" className="text-2xs text-red-600 dark:text-red-400 px-0.5">{openError}</p>
                )}
              </>
            )}
          </motion.div>
      )}
    </section>
  )
}
