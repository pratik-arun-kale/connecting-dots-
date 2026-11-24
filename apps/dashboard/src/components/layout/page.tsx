import React from 'react';
import { cn } from '@/lib/utils';

/** Slim bar at the top of a page: breadcrumb/title on the left, actions on
 *  the right. Sticks to the top of the scrolling main area. */
export function PageHeader({ children, actions, className }: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 bg-background/95 px-4 backdrop-blur md:px-6', className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

/** Centered reading column for page content. */
export function PageBody({ children, className, wide = false }: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 pb-16 pt-6 md:px-8', wide ? 'max-w-5xl' : 'max-w-180', className)}>
      {children}
    </div>
  );
}
