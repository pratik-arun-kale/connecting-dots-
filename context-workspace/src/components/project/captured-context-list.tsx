'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronDown, ChevronUp, ExternalLink, StickyNote, MessageSquare } from 'lucide-react';
import type { ApiContext } from '@/types';

interface CapturedContextListProps {
  contexts: ApiContext[];
}

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini',
  perplexity: 'Perplexity', unknown: 'Page',
};

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  claude:     'bg-amber-500/15 text-amber-400 border-amber-500/20',
  gemini:     'bg-sky-500/15 text-sky-400 border-sky-500/20',
  perplexity: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
};

interface Msg { role: string; content: string }

function ContextCard({ context }: { context: ApiContext }) {
  const [expanded, setExpanded] = useState(false);

  // Resolve fields — prefer promoted columns, fall back to raw_content / metadata
  const raw      = context.raw_content as Record<string, unknown>;
  const platform = context.platform
    ?? (context.metadata as Record<string, string> | null)?.platform
    ?? (raw?.platform as string | undefined)
    ?? 'unknown';

  const title    = context.title ?? (raw?.title as string | undefined) ?? 'Captured Page';
  const chatUrl  = context.chat_url
    ?? (context.metadata as Record<string, string> | null)?.url
    ?? (raw?.chat_url as string | undefined);

  const messages: Msg[] = (raw?.messages as Msg[] | undefined) ?? [];
  const msgCount = context.messages_count ?? messages.length;
  const preview  = messages.slice(0, expanded ? messages.length : 3);

  const colorClass = PLATFORM_COLORS[platform] ?? 'bg-muted/20 text-muted-foreground border-border/40';

  return (
    <Card className="border border-border/60 bg-card/45 hover:border-border/80 transition-all">
      <CardHeader className="p-4 pb-2">
        {/* Top row: platform badge + timestamp */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>
              {PLATFORM_LABELS[platform] ?? platform}
            </span>
          </div>
          <time className="text-[10px] text-muted-foreground font-mono shrink-0">
            {new Date(context.created_at).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </time>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-foreground mt-2 leading-snug line-clamp-2">
          {title}
        </p>

        {/* URL */}
        {chatUrl && (
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-mono truncate mt-1 max-w-full"
          >
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{chatUrl}</span>
          </a>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-2 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No messages extracted.</p>
        ) : (
          <>
            {preview.map((msg, i) => (
              <div
                key={i}
                className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-foreground'
                    : 'bg-muted/20 border border-border/30 text-muted-foreground'
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider mr-2 opacity-60">
                  {msg.role}
                </span>
                <span className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-3'}>
                  {msg.content}
                </span>
              </div>
            ))}

            {messages.length > 3 && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-medium mt-1 cursor-pointer"
              >
                {expanded ? (
                  <><ChevronUp className="w-3 h-3" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" /> Show {messages.length - 3} more messages</>
                )}
              </button>
            )}
          </>
        )}

        <div className="pt-1 border-t border-border/20 text-[10px] text-muted-foreground/60 font-mono">
          {msgCount} message{msgCount !== 1 ? 's' : ''} · {context.id.slice(0, 8)}
        </div>
      </CardContent>
    </Card>
  );
}

export function CapturedContextList({ contexts }: CapturedContextListProps) {
  if (contexts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl border-border bg-card/25 text-center">
        <StickyNote className="w-8 h-8 text-muted-foreground/60 mb-3" />
        <h4 className="font-semibold text-sm text-foreground mb-1">No Context Captured Yet</h4>
        <p className="text-xs text-muted-foreground max-w-xs">
          Open ChatGPT, Claude, or Gemini, then click{' '}
          <span className="font-semibold text-foreground">Capture Context</span> in the extension popup.
          The conversation will appear here instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contexts.map(ctx => (
        <ContextCard key={ctx.id} context={ctx} />
      ))}
    </div>
  );
}
