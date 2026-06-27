'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store';
import {
  FolderKanban,
  MessageSquare,
  Bookmark,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Brain,
  Sparkles,
} from 'lucide-react';

const MENU_ITEMS = [
  { label: 'Dashboard',     href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',      href: '/projects',  icon: FolderKanban },
  { label: 'Sessions',      href: '/sessions',  icon: MessageSquare },
  { label: 'Saved Contexts',href: '/contexts',  icon: Bookmark },
];

const GENERAL_ITEMS = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, collapse, expand } = useSidebarStore();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const NavItem = ({ item }: { item: { label: string; href: string; icon: React.ElementType } }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        title={isCollapsed ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group relative',
          active
            ? 'bg-[#0f172a] text-white shadow-sm'
            : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]',
          isCollapsed && 'justify-center px-0'
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-white' : 'text-[#94a3b8] group-hover:text-[#0f172a]')} />
        {!isCollapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-white transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-[64px]' : 'w-[220px]'
      )}
    >
      {/* Brand */}
      <div className={cn(
        'h-16 flex items-center border-b border-border px-4 shrink-0',
        isCollapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="w-8 h-8 rounded-xl bg-[#0f172a] flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        {!isCollapsed && (
          <div>
            <p className="text-[13px] font-bold text-[#0f172a] leading-tight">Context</p>
            <p className="text-[11px] text-[#94a3b8] leading-tight">Workspace</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {/* MENU section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-widest px-3 mb-2">
              Menu
            </p>
          )}
          {MENU_ITEMS.map((item) => <NavItem key={item.href} item={item} />)}
        </div>

        {/* GENERAL section */}
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-widest px-3 mb-2">
              General
            </p>
          )}
          {GENERAL_ITEMS.map((item) => <NavItem key={item.href} item={item} />)}
        </div>
      </div>

      {/* Bottom CTA card */}
      {!isCollapsed && (
        <div className="p-3 shrink-0">
          <div className="rounded-2xl bg-[#0f172a] p-4 text-white">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <p className="text-[13px] font-semibold leading-snug mb-1">
              Ask AI about your sessions
            </p>
            <p className="text-[11px] text-white/60 leading-relaxed mb-3">
              Query all captured context with the Ask AI tab.
            </p>
            <Link
              href="/projects"
              className="block text-center text-[12px] font-semibold bg-white text-[#0f172a] rounded-lg py-1.5 hover:bg-white/90 transition-colors"
            >
              Open Projects
            </Link>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={() => isCollapsed ? expand() : collapse()}
          className="w-full flex justify-center items-center gap-2 p-2 rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-all text-[12px] font-medium"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
