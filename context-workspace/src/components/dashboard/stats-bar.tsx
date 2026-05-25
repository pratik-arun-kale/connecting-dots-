'use client';

import React from 'react';
import { useProjects, useSessions, useContexts } from '@/lib/query';
import { Folder, MessageSquare, Bookmark, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function StatsBar() {
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessions();
  const { data: contexts = [], isLoading: isLoadingContexts } = useContexts();

  const activeSessions = sessions.filter((s) => s.status === 'active');

  const stats = [
    {
      label: 'Total Projects',
      value: projects.length,
      icon: Folder,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'Total Sessions',
      value: sessions.length,
      icon: MessageSquare,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Saved Contexts',
      value: contexts.length,
      icon: Bookmark,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Active Sessions',
      value: activeSessions.length,
      icon: Play,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-6">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Card key={i} className="border border-border/60 bg-card/45 hover:bg-card/75 transition-all">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold tracking-tight mt-1 text-foreground">
                  {isLoadingProjects || isLoadingSessions || isLoadingContexts ? (
                    <span className="inline-block w-8 h-6 bg-muted rounded animate-pulse" />
                  ) : (
                    stat.value
                  )}
                </h3>
              </div>
              <div className={`p-2 rounded-lg ${stat.bg} ${stat.color} shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
