'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useContexts } from '@/lib/query';
import { 
  BarChart, 
  Tag, 
  Info,
  Bookmark,
  MessageSquare,
  Clock,
  ExternalLink
} from 'lucide-react';
import type { Session } from '@/types';

interface SessionMetadataProps {
  session: Session;
}

export function SessionMetadata({ session }: SessionMetadataProps) {
  // Query all contexts related to this session
  const { data: contexts = [], isLoading } = useContexts({ sessionId: session.id });

  // Format Duration
  const calculateDuration = () => {
    const start = new Date(session.startedAt).getTime();
    const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) {
      return `${diffMins} mins`;
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours} hrs ${mins} mins`;
    }
  };

  return (
    <div className="space-y-5">
      {/* Session Stats Card */}
      <Card className="border border-border/60 bg-card/45">
        <CardHeader className="p-4 pb-2 border-b border-border/30">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BarChart className="w-3.5 h-3.5 text-indigo-400" />
            Session Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Messages
            </span>
            <span className="font-semibold text-foreground">{session.messagesCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5" />
              Saved Contexts
            </span>
            <span className="font-semibold text-foreground">{contexts.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Duration
            </span>
            <span className="font-semibold text-foreground">{calculateDuration()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Captured Session Context Card */}
      <Card className="border border-border/60 bg-card/45">
        <CardHeader className="p-4 pb-2 border-b border-border/30">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-emerald-500" />
            Captured Context ({contexts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-2 py-2">
              <div className="h-10 bg-muted/30 rounded animate-pulse" />
              <div className="h-10 bg-muted/30 rounded animate-pulse" />
            </div>
          ) : contexts.length === 0 ? (
            <p className="text-xs text-muted-foreground/80 py-2 italic text-center">
              No files or code snippets pinned from this session.
            </p>
          ) : (
            <div className="space-y-2.5">
              {contexts.map((ctx) => (
                <div
                  key={ctx.id}
                  className="p-2.5 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/30 transition-all flex flex-col gap-1 min-w-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-indigo-400 truncate max-w-[120px]">
                      {ctx.title}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground bg-muted/40 px-1 rounded uppercase shrink-0">
                      {ctx.type}
                    </span>
                  </div>
                  {ctx.metadata?.file && (
                    <span className="text-[9px] text-muted-foreground/60 font-mono truncate">
                      {ctx.metadata.file}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Info Box */}
      <div className="bg-muted/10 border border-border/40 p-3 rounded-lg flex gap-2">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h5 className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Sync Information</h5>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            This session is synchronized automatically via developer client logs. Captured files are cached in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}
