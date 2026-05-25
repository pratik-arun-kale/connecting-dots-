'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store';
import { 
  Brain, 
  FolderKanban, 
  MessageSquare, 
  Bookmark, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';

const iconMap = {
  Brain,
  FolderKanban,
  MessageSquare,
  Bookmark,
  Settings,
  LayoutDashboard
};

type IconName = keyof typeof iconMap;

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, collapse, expand } = useSidebarStore();

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' as IconName },
    { label: 'Projects', href: '/projects', icon: 'FolderKanban' as IconName },
    { label: 'Sessions', href: '/sessions', icon: 'MessageSquare' as IconName },
    { label: 'Saved Contexts', href: '/contexts', icon: 'Bookmark' as IconName },
    { label: 'Settings', href: '/settings', icon: 'Settings' as IconName },
  ];

  const handleToggleCollapse = () => {
    if (isCollapsed) {
      expand();
    } else {
      collapse();
    }
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-[60px]' : 'w-[260px]'
      )}
    >
      {/* Brand Logo */}
      <div className={cn(
        'h-12 flex items-center border-b border-border px-4 shrink-0',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
          <Brain className="w-5 h-5 text-indigo-500 shrink-0" />
          {!isCollapsed && <span className="text-sm">Context Workspace</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-border'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground border border-transparent',
                isCollapsed && 'justify-center px-0'
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Toggle */}
      <div className="p-2 border-t border-border flex items-center justify-end">
        <button
          onClick={handleToggleCollapse}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full flex justify-center items-center gap-2"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
