'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Code, 
  StickyNote, 
  Link as LinkIcon, 
  Image as ImageIcon,
  Calendar,
  FileText
} from 'lucide-react';
import type { Context } from '@/types';

interface ContextListProps {
  contexts: Context[];
}

export function ContextList({ contexts }: ContextListProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-amber-500" />;
      case 'code':
        return <Code className="w-4 h-4 text-purple-400" />;
      case 'note':
        return <StickyNote className="w-4 h-4 text-emerald-500" />;
      case 'link':
        return <LinkIcon className="w-4 h-4 text-sky-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-rose-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'chat': return 'Chat';
      case 'code': return 'Code Snippet';
      case 'note': return 'Developer Note';
      case 'link': return 'Reference Link';
      case 'image': return 'Diagram/Image';
      default: return 'Context';
    }
  };

  if (contexts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl border-border bg-card/25 text-center">
        <StickyNote className="w-8 h-8 text-muted-foreground/60 mb-3" />
        <h4 className="font-semibold text-sm text-foreground mb-1">No Context Captured</h4>
        <p className="text-xs text-muted-foreground max-w-xs">
          No files, chat transcripts, or notes have been saved as permanent context.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contexts.map((context) => (
        <Card key={context.id} className="border border-border/60 bg-card/45 hover:border-border/80 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {getIcon(context.type)}
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {getLabel(context.type)}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {new Date(context.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <CardTitle className="text-sm font-semibold text-foreground mt-2 leading-snug">
              {context.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 flex-1 flex flex-col justify-between gap-4">
            {context.type === 'code' ? (
              <pre className="text-[11px] font-mono p-3 bg-muted/30 border border-border/40 rounded-lg text-foreground/90 overflow-x-auto max-h-[140px] whitespace-pre select-all">
                <code>{context.content}</code>
              </pre>
            ) : context.type === 'link' ? (
              <a
                href={context.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline break-all flex items-center gap-1"
              >
                <span>{context.content}</span>
              </a>
            ) : (
              <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed whitespace-pre-wrap">
                {context.content}
              </p>
            )}

            {context.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-border/20">
                {context.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-mono text-muted-foreground/80 bg-muted/15 px-1.5 py-0.2 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
