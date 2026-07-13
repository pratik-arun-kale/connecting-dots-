'use client';

import React, { useState } from 'react';
import { useSearchConversations } from '@/lib/query';
import type { ConversationSearchResult } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/components/project/rag-query-panel';
import {
  Search,
  ExternalLink,
  Loader2,
  AlertCircle,
  FolderSearch,
} from 'lucide-react';

// ── Conversation result card ──────────────────────────────────────────────────

function ConversationResultCard({ result }: { result: ConversationSearchResult }) {
  const platformColor = PLATFORM_COLORS[result.provider] ?? PLATFORM_COLORS.unknown;
  const platformLabel = PLATFORM_LABELS[result.provider] ?? result.provider;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4 space-y-2.5">
      {/* Title + provider + score */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${platformColor}`}>
            {platformLabel}
          </span>
          <span className="text-sm text-foreground font-medium line-clamp-1">
            {result.title || 'Untitled Conversation'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
          score {result.relevance_score.toFixed(2)}
        </span>
      </div>

      {/* Summary, if the backend ever populates one */}
      {result.summary && (
        <p className="text-xs text-muted-foreground italic">{result.summary}</p>
      )}

      {/* Snippets */}
      {result.top_relevant_snippets.length > 0 && (
        <div className="space-y-1.5">
          {result.top_relevant_snippets.map((snippet, i) => (
            <p
              key={i}
              className="text-xs text-muted-foreground leading-relaxed line-clamp-3 border-l-2 border-border/40 pl-2.5"
            >
              {snippet}
            </p>
          ))}
        </div>
      )}

      {/* Open Chat */}
      {result.chat_url && (
        <a
          href={result.chat_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open Chat
        </a>
      )}
    </div>
  );
}

// ── Example queries ────────────────────────────────────────────────────────────

const EXAMPLE_QUERIES = ['Nvidia', 'OAuth', 'ChromaDB', 'Resume'];

// ── Main panel ────────────────────────────────────────────────────────────────

interface ConversationSearchPanelProps {
  projectId: string;
}

export function ConversationSearchPanel({ projectId }: ConversationSearchPanelProps) {
  const [query, setQuery] = useState('');
  const { mutate: search, data: result, isPending, error, reset } = useSearchConversations(projectId);

  const handleSubmit = () => {
    const q = query.trim();
    if (!q || isPending) return;
    search(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExample = (q: string) => {
    setQuery(q);
    reset();
    search(q);
  };

  return (
    <div className="space-y-4">
      <Card className="border border-border/60 bg-card/45">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-foreground">Search Previous Conversations</span>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-3">
          {/* Search input */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); reset(); }}
                onKeyDown={handleKeyDown}
                placeholder="Find where you discussed a topic…"
                className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!query.trim() || isPending}
              className="shrink-0 w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              {isPending
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Search className="w-4 h-4 text-white" />}
            </button>
          </div>

          {/* Example queries */}
          {!result && !isPending && (
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleExample(q)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:border-indigo-500/40 hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isPending && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          <p className="text-xs text-muted-foreground">Searching your captured conversations…</p>
        </div>
      )}

      {/* Error */}
      {error && !isPending && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-400">Search failed</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !isPending && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {result.total_conversations} conversation{result.total_conversations === 1 ? '' : 's'} found
          </p>

          {result.conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <FolderSearch className="w-6 h-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No conversations matched this topic.</p>
              <p className="text-xs text-muted-foreground/70">Try a different keyword or capture more conversations.</p>
            </div>
          ) : (
            result.conversations.map(c => (
              <ConversationResultCard key={c.conversation_id} result={c} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
