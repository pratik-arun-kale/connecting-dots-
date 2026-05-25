'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  MessageSquare,
  Calendar,
  Bot,
  FileText,
  Sparkles,
  Link2,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { ApiSession } from '@/types';

interface SessionTimelineProps {
  sessions: ApiSession[];
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'chatgpt': return <Bot className="w-3.5 h-3.5 text-emerald-400" />;
    case 'claude':  return <FileText className="w-3.5 h-3.5 text-amber-400" />;
    case 'gemini':  return <Sparkles className="w-3.5 h-3.5 text-sky-400" />;
    default:        return <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'chatgpt': return 'ChatGPT';
    case 'claude':  return 'Claude';
    case 'gemini':  return 'Gemini';
    default:        return platform;
  }
}

function LinkStatusBadge({ session }: { session: ApiSession }) {
  if (session.link_status === 'linked' && session.linked_url) {
    return (
      <a
        href={session.linked_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors max-w-60 group/link"
      >
        <Link2 className="w-3 h-3 shrink-0" />
        <span className="truncate">{session.linked_url.replace('https://', '')}</span>
        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
      </a>
    );
  }

  if (session.link_status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
        <AlertCircle className="w-3 h-3" />
        Link conflict
      </span>
    );
  }

  // pending (default)
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400 bg-zinc-500/10 px-2 py-0.5 rounded border border-zinc-500/20">
      <Clock className="w-3 h-3" />
      Waiting for URL
    </span>
  );
}

export function SessionTimeline({ sessions }: SessionTimelineProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl border-border bg-card/25 text-center">
        <MessageSquare className="w-8 h-8 text-muted-foreground/60 mb-3" />
        <h4 className="font-semibold text-sm text-foreground mb-1">No Sessions Yet</h4>
        <p className="text-xs text-muted-foreground max-w-xs">
          Open this project from the dashboard to launch AI platform tabs and start capturing sessions.
        </p>
      </div>
    );
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((session) => (
        <Card
          key={session.id}
          className="border border-border/60 bg-card/45 hover:border-border hover:bg-card transition-all duration-200"
        >
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: platform + title + date */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground bg-muted/20 px-2 py-0.5 rounded border border-border/30 shrink-0">
                  <PlatformIcon platform={session.source_platform} />
                  {platformLabel(session.source_platform)}
                </span>
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {session.title ?? 'Untitled Session'}
                </h4>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>
                  {new Date(session.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {/* Right: link status */}
            <div className="shrink-0">
              <LinkStatusBadge session={session} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
