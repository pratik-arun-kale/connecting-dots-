'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Bookmark, Calendar, Settings } from 'lucide-react';
import type { Project } from '@/types';

interface ProjectHeaderProps {
  project: Project;
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <div className="space-y-4 pb-6 border-b border-border/50">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Title and Color Tag */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {project.name}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-3xl leading-relaxed">
            {project.description}
          </p>
        </div>

        {/* Action Button Placeholder */}
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-border/80 text-muted-foreground hover:text-foreground cursor-pointer">
          <Settings className="w-4 h-4" />
          <span>Project Settings</span>
        </Button>
      </div>

      {/* Meta Stats Row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-muted-foreground pt-1">
        <span className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-amber-500/80" />
          <span className="text-foreground font-semibold">{project.sessionsCount}</span> sessions
        </span>
        <span className="flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-emerald-500/80" />
          <span className="text-foreground font-semibold">{project.contextsCount}</span> contexts
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>Created on {new Date(project.createdAt).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}</span>
        </span>
      </div>
    </div>
  );
}
