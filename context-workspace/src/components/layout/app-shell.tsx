'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import { SearchDialog } from '@/features/search/search-dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import Link from 'next/link';
import { Brain, FolderKanban, MessageSquare, Bookmark, Settings, LayoutDashboard } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Sessions', href: '/sessions', icon: MessageSquare },
    { label: 'Saved Contexts', href: '/contexts', icon: Bookmark },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Desktop Sidebar (visible on md+) */}
      <Sidebar />

      {/* Mobile Drawer (visible on mobile only) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0 bg-sidebar border-r border-border">
          <div className="h-12 flex items-center px-4 border-b border-border">
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 font-bold tracking-tight"
              onClick={() => setMobileOpen(false)}
            >
              <Brain className="w-5 h-5 text-indigo-500" />
              <span className="text-sm">Context Workspace</span>
            </Link>
          </div>
          <nav className="flex-1 py-4 px-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-border'
                      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground border border-transparent'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav onMobileMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Search Palette Dialog */}
      <SearchDialog />
    </div>
  );
}
