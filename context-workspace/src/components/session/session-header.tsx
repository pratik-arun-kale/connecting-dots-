'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/lib/query';
import { 
  Globe, 
  Terminal, 
  FileText, 
  Calendar, 
  Folder,
  ArrowLeft
} from 'lucide-react';
import type { Session } from '@/types';

interface SessionHeaderProps {
  session: Session;
}

export function SessionHeader({ session }: SessionHeaderProps) {
  const { data: projects = [] } = useProjects();
  
  const project = projects.find((p) => p.id === session.projectId);

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'chrome':
        return <Globe className="w-3.5 h-3.5 text-sky-400" />;
      case 'vscode':
        return <Terminal className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'chrome': return 'Chrome Extension';
      case 'vscode': return 'VS Code Plugin';
      default: return 'Manual Context';
    }
  };

  return (
    <div className="space-y-4 pb-5 border-b border-border/50">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Title and Badges */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
              {session.title}
            </h1>
            
            {session.status === 'active' ? (
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-1 shrink-0">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-500/10 px-1.5 py-0.2 rounded border border-zinc-500/20 shrink-0">
                Completed
              </span>
            )}

            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/20 px-1.5 py-0.2 rounded border border-border/30 flex items-center gap-1 shrink-0">
              {getSourceIcon(session.source)}
              <span>{getSourceLabel(session.source)}</span>
            </span>
          </div>

          {/* Project relation links */}
          {project && (
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              <Folder className="w-3.5 h-3.5" />
              <span>Project: {project.name}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Tags and Timeline details */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>Started: {new Date(session.startedAt).toLocaleString()}</span>
        </span>
        {session.endedAt && (
          <span>• Ended: {new Date(session.endedAt).toLocaleString()}</span>
        )}
        
        {session.tags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span>•</span>
            {session.tags.map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground bg-muted/20 px-1.5 py-0.2 rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
