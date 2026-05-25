'use client';

import React from 'react';
import { CodeBlock } from './code-block';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  
  // Custom message parsing to split text content from code block blocks (```lang ... ```)
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      // Check if this part is a code block
      const match = part.match(/^```(\w*)\n([\s\S]*?)```$/);
      if (match) {
        const language = match[1] || undefined;
        const code = match[2].trim();
        return (
          <CodeBlock
            key={index}
            code={code}
            language={language}
            fileName={language ? `snippet.${language}` : 'code-snippet'}
          />
        );
      }
      
      // Render standard paragraph breaks for standard text content
      return (
        <span key={index} className="whitespace-pre-wrap leading-relaxed block text-sm">
          {part}
        </span>
      );
    });
  };

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground/80 italic text-xs">
        No conversation messages logged in this session.
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <div
            key={message.id}
            className={cn(
              'flex items-start gap-3.5 max-w-full',
              isUser ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            {/* Avatar Column */}
            <Avatar className={cn(
              'w-8 h-8 shrink-0 border',
              isUser ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-border bg-card'
            )}>
              <AvatarFallback className="text-[10px] uppercase font-bold text-foreground">
                {isUser ? <User className="w-4 h-4 text-indigo-400" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
              </AvatarFallback>
            </Avatar>

            {/* Bubble Column */}
            <div className={cn(
              'flex flex-col max-w-[85%] sm:max-w-[75%]',
              isUser ? 'items-end' : 'items-start'
            )}>
              {/* Bubble Body */}
              <div className={cn(
                'rounded-2xl px-4 py-3 border text-foreground/95 select-text',
                isUser
                  ? 'bg-indigo-600/10 border-indigo-500/20 rounded-tr-none'
                  : 'bg-card/45 border-border/80 rounded-tl-none'
              )}>
                {renderMessageContent(message.content)}
              </div>

              {/* Message Metadata footer */}
              <div className={cn(
                'flex items-center gap-2 mt-1.5 text-[10px] font-mono text-muted-foreground px-1',
                isUser ? 'justify-end' : 'justify-start'
              )}>
                {!isUser && message.metadata?.model && (
                  <span className="font-semibold text-[9px] bg-muted/30 text-indigo-300 border border-border/50 px-1.5 py-0.2 rounded uppercase shrink-0">
                    {message.metadata.model}
                  </span>
                )}
                <span>
                  {new Date(message.timestamp).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
