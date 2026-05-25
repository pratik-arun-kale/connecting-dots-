'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { useSessions } from '@/lib/query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, MessageSquare, Calendar, ArrowRight } from 'lucide-react';
import { SessionCardSkeleton } from '@/components/shared/loading-skeleton';

export default function SessionsPage() {
  const { data: sessions = [], isLoading } = useSessions();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Sessions"
        description="View past and active synced chat/debugging sessions."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sessions by title or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/20 border-border focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl border-border bg-card/20 min-h-[300px]">
          <MessageSquare className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-lg text-foreground mb-1">No Sessions Found</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            {searchQuery
              ? 'No sessions matched your search criteria. Try typing something else.'
              : 'Sync context from your Chrome extension or VS Code plugin to see sessions here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`} className="block group">
              <Card className="border border-border/60 hover:border-border bg-card/45 hover:bg-card transition-all duration-200">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <h4 className="font-semibold text-sm text-foreground group-hover:text-indigo-400 transition-colors truncate">
                      {session.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(session.startedAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span>•</span>
                      <span>{session.messagesCount} messages</span>
                      {session.tags.length > 0 && (
                        <>
                          <span>•</span>
                          {session.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="font-mono bg-muted/20 px-1.5 py-0.5 rounded">
                              #{tag}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
