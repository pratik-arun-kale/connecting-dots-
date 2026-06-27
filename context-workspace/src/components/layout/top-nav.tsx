'use client';

import React, { useEffect } from 'react';
import { Menu, Search, Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchStore, useWorkspaceStore } from '@/store';
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

  useEffect(() => {
    const interval = setInterval(() => {
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('synced'), 2000);
    }, 15000);
    return () => clearInterval(interval);
  }, [setSyncStatus]);

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

  return (
    <header className="h-16 border-b border-border bg-white flex items-center justify-between px-6 shrink-0">
      {/* Left: Mobile toggle */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8 text-[#64748b]"
          onClick={onMobileMenuToggle}
        >
          <Menu className="w-4 h-4" />
        </Button>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-xs mx-6">
        <button
          onClick={() => setOpenSearch(true)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-border bg-[#f8fafc] hover:border-[#cbd5e1] text-[#94a3b8] hover:text-[#64748b] text-[13px] transition-all"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span>Search task…</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 h-5 px-1.5 text-[10px] font-medium text-[#94a3b8] bg-white border border-border rounded pointer-events-none">
            ⌘F
          </kbd>
        </button>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-3">
        {/* Sync indicator */}
        {syncStatus === 'syncing' && (
          <span className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#d97706] font-medium">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Syncing
          </span>
        )}

        {/* Notification bell */}
        <button className="relative w-9 h-9 rounded-xl border border-border bg-white hover:bg-[#f8fafc] flex items-center justify-center text-[#64748b] hover:text-[#0f172a] transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4f46e5] border-2 border-white" />
        </button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border border-border bg-white hover:bg-[#f8fafc] transition-all" />}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-[#0f172a] text-white text-[11px] font-bold">
                {mockUser.name.split(' ').map((n: string) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:block text-left">
              <p className="text-[12px] font-semibold text-[#0f172a] leading-tight">{mockUser.name}</p>
              <p className="text-[10px] text-[#94a3b8] leading-tight">{mockUser.email}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-white border-border shadow-lg" align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="text-[13px] font-semibold text-[#0f172a]">{mockUser.name}</p>
              <p className="text-[11px] text-[#94a3b8]">{mockUser.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]">Profile Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px] text-[#ef4444] focus:text-[#ef4444]">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
