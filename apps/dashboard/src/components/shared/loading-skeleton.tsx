import React from 'react';

export function ProjectCardSkeleton() {
  return (
    <div className="border border-border bg-card rounded-xl p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-muted" />
          <div className="h-5 w-32 bg-muted rounded" />
        </div>
        <div className="h-4 w-12 bg-muted rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex gap-4">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-16 bg-muted rounded" />
        </div>
        <div className="h-4 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}

export function SessionCardSkeleton() {
  return (
    <div className="border border-border bg-card rounded-xl p-5 space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="flex gap-2">
            <div className="h-4 w-16 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
        </div>
        <div className="h-5 w-16 bg-muted rounded" />
      </div>
      <div className="flex gap-2 pt-2">
        <div className="h-4 w-12 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
      <div className="flex gap-3 max-w-[70%]">
        <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="space-y-2 bg-muted/20 p-4 rounded-2xl rounded-tl-none flex-1">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-5/6 bg-muted rounded" />
        </div>
      </div>
      <div className="flex gap-3 max-w-[70%] self-end">
        <div className="space-y-2 bg-primary/10 p-4 rounded-2xl rounded-tr-none flex-1">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-4/5 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
