'use client';

import React, { useEffect } from 'react';
import { Menu, Search, RefreshCw, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchStore, useWorkspaceStore, useSidebarStore } from '@/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockUser } from '@/mock';

interface TopNavProps {
  onMobileMenuToggle?: () => void;
}

export function TopNav({ onMobileMenuToggle }: TopNavProps) {
  const setOpenSearch = useSearchStore((state) => state.setOpen);
  const syncStatus = useWorkspaceStore((state) => state.syncStatus);
  const setSyncStatus = useWorkspaceStore((state) => state.setSyncStatus);

  // Auto-simulate syncing states periodically to make the UI feel alive
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncStatus('syncing');
      setTimeout(() => {
        setSyncStatus('synced');
      }, 2000);
    }, 15000);

    return () => clearInterval(interval);
  }, [setSyncStatus]);

  // Handle Ctrl+K/Cmd+K shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpenSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpenSearch]);

  const getSyncBadge = () => {
    switch (syncStatus) {
      case 'syncing':
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-500 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Syncing</span>
          </span>
        );
      case 'synced':
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Synced</span>
          </span>
        );
      case 'offline':
        return (
          <span className="flex items-center gap-1.5 text-xs text-rose-500 font-medium bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Offline</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-4 shrink-0">
      {/* Left: Mobile menu & Page Context */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={onMobileMenuToggle}
        >
          <Menu className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground font-mono">WORKSPACE / DEFAULT</span>
      </div>

      {/* Center: Global Search Bar Trigger */}
      <div className="flex-1 max-w-md mx-4">
        <button
          onClick={() => setOpenSearch(true)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-input hover:border-accent-foreground/30 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground text-sm transition-all duration-200"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span>Search workspace...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/80 bg-background border border-border rounded shadow-xs pointer-events-none">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right: Sync Status & User Menu */}
      <div className="flex items-center gap-3">
        {getSyncBadge()}
        
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="relative h-8 w-8 rounded-full" />}
          >
            <Avatar className="h-8 w-8 border border-border">
              <AvatarFallback className="bg-muted text-foreground text-xs uppercase">
                {mockUser.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{mockUser.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{mockUser.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon className="mr-2 h-4 w-4" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-500 focus:text-rose-500">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
