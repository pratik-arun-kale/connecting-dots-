'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useProjectQuery } from '@/lib/query';
import type { RagCitation, RagQueryResponse } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Bot,
  Send,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';

// ── Confidence badge ───────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW:    'bg-red-500/15 text-red-400 border-red-500/30',
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini',
  perplexity: 'Perplexity', unknown: 'Page',
};

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  claude:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  gemini:     'bg-sky-500/10 text-sky-400 border-sky-500/20',
  perplexity: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  unknown:    'bg-muted/20 text-muted-foreground border-border/30',
};

// ── Citation card ─────────────────────────────────────────────────────────────

function CitationCard({ citation, index }: { citation: RagCitation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const platformColor = PLATFORM_COLORS[citation.platform] ?? PLATFORM_COLORS.unknown;
  const platformLabel = PLATFORM_LABELS[citation.platform] ?? citation.platform;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
            [{index + 1}]
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${platformColor}`}>
            {platformLabel}
          </span>
          {citation.title && (
            <span className="text-xs text-foreground font-medium line-clamp-1 max-w-[200px]">
              {citation.title}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
          {citation.reranker_score.toFixed(2)}
        </span>
      </div>

      {citation.chat_url && (
        <a
          href={citation.chat_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-mono truncate mb-1.5"
        >
          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{citation.chat_url}</span>
        </a>
      )}

      <p className={`text-xs text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
        {citation.excerpt}
      </p>

      {citation.excerpt.length > 200 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 cursor-pointer"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" />Show less</>
            : <><ChevronDown className="w-3 h-3" />Show more</>}
        </button>
      )}
    </div>
  );
}

// ── Answer block ──────────────────────────────────────────────────────────────

function AnswerBlock({ result }: { result: RagQueryResponse }) {
  const confStyle = CONFIDENCE_STYLES[result.confidence] ?? CONFIDENCE_STYLES.LOW;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-sm font-semibold text-foreground">Answer</span>
        </div>
        <div className="flex items-center gap-2">
          {result.corrective_triggered && (
            <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> corrective retrieval
            </span>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${confStyle}`}>
            {result.confidence}
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {result.chunks_indexed} chunks
          </span>
        </div>
      </div>

      {/* Answer text */}
      <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-4">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {result.answer}
        </p>
      </div>

      {/* Query used (if different from original) */}
      {result.query_used !== result.query_used && (
        <p className="text-[10px] text-muted-foreground font-mono">
          Query used: <span className="text-foreground">{result.query_used}</span>
        </p>
      )}

      {/* Citations */}
      {result.citations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Sources ({result.citations.length})
          </p>
          {result.citations.map((c, i) => (
            <CitationCard key={c.chunk_id} citation={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Suggested questions ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What did I discuss about authentication?',
  'Summarize the main topics from my conversations',
  'What solutions were suggested for the problems I faced?',
  'What code patterns did I ask about?',
];

// ── Main panel ────────────────────────────────────────────────────────────────

interface RagQueryPanelProps {
  projectId: string;
  chunksIndexed?: number;
}

export function RagQueryPanel({ projectId, chunksIndexed = 0 }: RagQueryPanelProps) {
  const [question, setQuestion] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: askQuestion, data: result, isPending, error, reset } = useProjectQuery(projectId);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question]);

  const handleSubmit = () => {
    const q = question.trim();
    if (!q || isPending) return;
    askQuestion(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (s: string) => {
    setQuestion(s);
    reset();
    // Focus textarea
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const hasContext = chunksIndexed > 0;

  return (
    <div className="space-y-6">
      {/* Input card */}
      <Card className="border border-border/60 bg-card/45">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-foreground">Ask your captured conversations</span>
            {hasContext && (
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {chunksIndexed} chunks indexed
              </span>
            )}
          </div>
          {!hasContext && (
            <p className="text-xs text-muted-foreground mt-1">
              Capture conversations with the extension first — they will be indexed automatically.
            </p>
          )}
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-3">
          {/* Textarea + send button */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={e => { setQuestion(e.target.value); reset(); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your captured conversations…"
                rows={1}
                className="w-full resize-none rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!question.trim() || isPending}
              className="shrink-0 w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              {isPending
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>

          {/* Suggestions */}
          {!result && !isPending && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:border-indigo-500/40 hover:text-indigo-400 transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isPending && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <Bot className="w-4 h-4 text-indigo-400 absolute inset-0 m-auto" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Searching your conversations…</p>
            <p className="text-xs text-muted-foreground">Running hybrid BM25 + vector retrieval → reranking</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isPending && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-400">Query failed</p>
            <p className="text-xs text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !isPending && (
        <Card className="border border-indigo-500/20 bg-card/45">
          <CardContent className="p-4">
            <AnswerBlock result={result} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
