'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import { SearchDialog } from '@/features/search/search-dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useSearchStore } from '@/store';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const setOpenSearch = useSearchStore((s) => s.setOpen);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenSearch(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpenSearch]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar variant="drawer" onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile-only strip: the sidebar lives in a drawer below md. */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link href="/notes" className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="h-4 w-4" />
            Connecting Dots
          </Link>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <SearchDialog />
    </div>
  );
}
