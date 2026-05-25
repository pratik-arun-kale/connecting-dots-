'use client';

import React from 'react';
import Link from 'next/link';
import { useSessions, useProjects } from '@/lib/query';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MessageSquare, ArrowRight, Globe, Terminal, FileText } from 'lucide-react';

export function RecentSessions() {
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessions();
  const { data: projects = [] } = useProjects();

  // Show only 5 most recent sessions
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'chrome':
        return <Globe className="w-3 h-3 text-sky-400" />;
      case 'vscode':
        return <Terminal className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <FileText className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'chrome':
        return 'Chrome';
      case 'vscode':
        return 'VS Code';
      default:
        return 'Manual';
    }
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.name : 'Unknown Project';
  };

  return (
    <Card className="border border-border/60 bg-card/45">
      <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-amber-500" />
          <CardTitle className="text-sm font-semibold">Recent Sessions</CardTitle>
        </div>
        <Link 
          href="/sessions" 
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
        >
          <span>View all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {isLoadingSessions ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No sessions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1 group"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground group-hover:text-indigo-400 transition-colors truncate">
                      {session.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal border-border/50 text-muted-foreground bg-muted/10 shrink-0">
                      {getProjectName(session.projectId)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 font-medium bg-muted/20 px-2 py-0.5 rounded border border-border/30">
                      {getSourceIcon(session.source)}
                      <span>{getSourceLabel(session.source)}</span>
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(session.startedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {session.tags.length > 0 && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          {session.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[10px] text-muted-foreground font-mono bg-muted/15 px-1.5 py-0.2 rounded">
                              #{tag}
                            </span>
                          ))}
                          {session.tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground/60 font-mono">
                              +{session.tags.length - 2}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                  {session.status === 'active' ? (
                    <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active
                    </span>
                  ) : session.status === 'completed' ? (
                    <span className="text-[11px] font-medium text-zinc-400 bg-zinc-500/10 px-2 py-0.5 rounded-full border border-zinc-500/20">
                      Completed
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      Archived
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all hidden sm:block" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
