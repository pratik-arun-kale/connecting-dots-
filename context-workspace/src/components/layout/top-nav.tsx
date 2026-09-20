'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Search, Bell, RefreshCw, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchStore, useWorkspaceStore, useAuthStore } from '@/store';
import { useThemeStore } from '@/store/theme-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { authService } from '@/lib/api/services/auth.service';

interface TopNavProps {
  onMobileMenuToggle?: () => void;
}

export function TopNav({ onMobileMenuToggle }: TopNavProps) {
  const router = useRouter();
  const setOpenSearch = useSearchStore((state) => state.setOpen);
  const syncStatus = useWorkspaceStore((state) => state.syncStatus);
  const setSyncStatus = useWorkspaceStore((state) => state.setSyncStatus);
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const displayName = user?.email?.split('@')[0] ?? 'Account';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleLogout = () => {
    // Best-effort server-side revoke — the client-side session clear (and
    // redirect) happens regardless of whether this network call succeeds.
    if (refreshToken) void authService.logout(refreshToken).catch(() => {});
    clearSession();
    router.push('/login');
  };

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
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      {/* Left: Mobile toggle */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8 text-muted-foreground"
          onClick={onMobileMenuToggle}
        >
          <Menu className="w-4 h-4" />
        </Button>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-xs mx-6">
        <button
          onClick={() => setOpenSearch(true)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-border bg-muted/40 hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground text-[13px] transition-all"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span>Search notes…</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 h-5 px-1.5 text-[10px] font-medium text-muted-foreground bg-card border border-border rounded pointer-events-none">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions + User */}
      <div className="flex items-center gap-3">
        {/* Sync indicator */}
        {syncStatus === 'syncing' && (
          <span className="hidden sm:flex items-center gap-1.5 text-[12px] text-amber-500 font-medium">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Syncing
          </span>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
        <button className="relative w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 border-2 border-card" />
        </button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-all" />}
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden sm:block text-left">
              <p className="text-[12px] font-semibold text-foreground leading-tight">{displayName}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{user?.email ?? ''}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-popover border-border shadow-lg" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="text-[13px] font-semibold text-foreground">{displayName}</p>
                <p className="text-[11px] text-muted-foreground">{user?.email ?? ''}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[13px] text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
