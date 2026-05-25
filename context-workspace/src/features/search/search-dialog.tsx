'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchStore } from '@/store';
import { useSearchResults } from '@/lib/query';
import { useDebounce } from '@/hooks/use-debounce';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Folder, MessageSquare, Bookmark, FileText } from 'lucide-react';
import type { SearchResult } from '@/types';

export function SearchDialog() {
  const router = useRouter();
  const isOpen = useSearchStore((state) => state.isOpen);
  const setOpen = useSearchStore((state) => state.setOpen);
  
  const [inputValue, setInputValue] = useState('');
  // Debounce the input for API query matching
  const debouncedQuery = useDebounce(inputValue, 200);

  const { data: results = [], isLoading } = useSearchResults(debouncedQuery);

  // Reset input when closed
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    if (item.type === 'project') {
      router.push(`/projects/${item.id}`);
    } else if (item.type === 'session') {
      router.push(`/sessions/${item.id}`);
    } else if (item.type === 'context' && item.sessionId) {
      router.push(`/sessions/${item.sessionId}?contextId=${item.id}`);
    } else if (item.type === 'message' && item.sessionId) {
      router.push(`/sessions/${item.sessionId}?messageId=${item.id}`);
    }
  };

  // Group results by type
  const projects = results.filter((r) => r.type === 'project');
  const sessions = results.filter((r) => r.type === 'session');
  const contexts = results.filter((r) => r.type === 'context');
  const messages = results.filter((r) => r.type === 'message');

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type to search projects, sessions, or saved contexts..."
        value={inputValue}
        onValueChange={setInputValue}
      />
      <CommandList className="max-h-[350px] p-2">
        {isLoading && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Searching...
          </div>
        )}
        
        {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found for &ldquo;{debouncedQuery}&rdquo;</CommandEmpty>
        )}

        {!isLoading && debouncedQuery.length < 2 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Enter at least 2 characters to search...
          </div>
        )}

        {projects.length > 0 && (
          <CommandGroup heading="Projects">
            {projects.map((item) => (
              <CommandItem
                key={item.id}
                value={`project-${item.title}-${item.id}`}
                onSelect={() => handleSelect(item)}
                className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-lg"
              >
                <Folder className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-md">
                    {item.excerpt}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {sessions.length > 0 && (
          <CommandGroup heading="Sessions">
            {sessions.map((item) => (
              <CommandItem
                key={item.id}
                value={`session-${item.title}-${item.id}`}
                onSelect={() => handleSelect(item)}
                className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-lg"
              >
                <MessageSquare className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-md">
                    {item.excerpt}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(contexts.length > 0 || messages.length > 0) && (
          <CommandGroup heading="Captured Context & Messages">
            {[...contexts, ...messages].map((item) => (
              <CommandItem
                key={item.id}
                value={`context-${item.title}-${item.id}`}
                onSelect={() => handleSelect(item)}
                className="flex items-center gap-2 cursor-pointer py-2 px-3 rounded-lg"
              >
                {item.type === 'context' ? (
                  <Bookmark className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-md">
                    {item.excerpt}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
