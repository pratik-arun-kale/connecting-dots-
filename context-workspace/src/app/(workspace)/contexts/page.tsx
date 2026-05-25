'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { ContextList } from '@/components/project/context-list';
import { useContexts } from '@/lib/query';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Bookmark, HelpCircle } from 'lucide-react';

export default function ContextsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<string>('all');

  // Load all contexts, filter them client side
  const { data: contexts = [], isLoading } = useContexts();

  const filteredContexts = contexts.filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = activeType === 'all' || c.type === activeType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Context"
        description="Permanently saved files, code snippets, notes, and references available to AI."
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-b border-border/20 pb-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search context items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/20 border-border focus:ring-indigo-500"
          />
        </div>

        {/* Type Tabs Filter */}
        <Tabs value={activeType} onValueChange={setActiveType} className="w-auto">
          <TabsList className="bg-muted/30 border border-border/50 h-9 p-0.5">
            <TabsTrigger value="all" className="text-xs font-semibold tracking-wider cursor-pointer">
              All
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs font-semibold tracking-wider cursor-pointer">
              Code
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-xs font-semibold tracking-wider cursor-pointer">
              Chat
            </TabsTrigger>
            <TabsTrigger value="note" className="text-xs font-semibold tracking-wider cursor-pointer">
              Notes
            </TabsTrigger>
            <TabsTrigger value="link" className="text-xs font-semibold tracking-wider cursor-pointer">
              Links
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-muted/20 border border-border/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredContexts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl border-border bg-card/20 min-h-[300px]">
          <Bookmark className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-lg text-foreground mb-1">No Context Items</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {searchQuery || activeType !== 'all'
              ? 'Try modifying your search query or switching active tab filter.'
              : 'Save code blocks, notes, or messages to compile your context workspace.'}
          </p>
        </div>
      ) : (
        <ContextList contexts={filteredContexts} />
      )}
    </div>
  );
}
