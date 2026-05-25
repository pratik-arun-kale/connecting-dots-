'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Bookmark, Calendar } from 'lucide-react';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  // Simple helper to format last active date
  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  return (
    <Link href={`/projects/${project.id}`} className="block group">
      <Card className="h-full border border-border/60 hover:border-border bg-card/45 hover:bg-card transition-all duration-200">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <CardTitle className="text-sm font-semibold text-foreground group-hover:text-indigo-400 transition-colors truncate">
                {project.name}
              </CardTitle>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
              {formatLastActive(project.lastActiveAt)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[32px]">
            {project.description}
          </p>
          
          <div className="flex items-center justify-between pt-3 border-t border-border/30 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-amber-500/80" />
                <span>{project.sessionsCount} sessions</span>
              </span>
              <span className="flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-emerald-500/80" />
                <span>{project.contextsCount} contexts</span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60">
              <Calendar className="w-3 h-3" />
              <span>{new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
