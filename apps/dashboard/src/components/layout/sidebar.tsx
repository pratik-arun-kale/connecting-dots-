'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Brain, House, Layers, LogOut, MessageSquare, Moon, MoreHorizontal,
  PanelLeft, Plus, Search, Sparkles, Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useSearchStore, useSidebarStore, useWorkspaceStore } from '@/store';
import { useThemeStore } from '@/store/theme-store';
import { useNotes, useProjects } from '@/lib/query';
import { authService } from '@/lib/api/services/auth.service';
import { NOTE_ORIGINS, getNoteOrigin } from '@/lib/context-platform';
import { getDisplayTitle } from '@/lib/note-display';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { ProjectSettingsDialog } from '@/components/project/project-settings-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '@/types';

const rowClass = (active: boolean) => cn(
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors cursor-pointer',
  active
    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
);

const sectionLabel = 'px-2.5 text-[11px] font-medium text-muted-foreground';

/**
 * `desktop` is the persistent, collapsible column; `drawer` is the same
 * content inside the mobile Sheet (never collapsed, closes on navigate).
 */
export function Sidebar({ variant = 'desktop', onNavigate }: { variant?: 'desktop' | 'drawer'; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed: storeCollapsed, collapse, expand } = useSidebarStore();
  const collapsed = variant === 'desktop' && storeCollapsed;
  const openSearch = useSearchStore((s) => s.setOpen);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const { data: projects = [] } = useProjects();
  const { data: notes = [], isLoading: notesLoading } = useNotes(activeProjectId);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Keep the project list short so the notes below stay in view; the
  // selected project is always shown even when it's past the cut.
  const [showAllProjects, setShowAllProjects] = useState(false);
  const PROJECTS_SHOWN = 5;
  const visibleProjects = showAllProjects
    ? projects
    : [
        ...projects.slice(0, PROJECTS_SHOWN),
        ...(activeProject && projects.indexOf(activeProject) >= PROJECTS_SHOWN ? [activeProject] : []),
      ];
  const hiddenProjectCount = projects.length - visibleProjects.length;

  const go = (href: string) => { router.push(href); onNavigate?.(); };

  const selectProject = (id: string | null) => {
    setActiveProject(id);
    // On a note page, switching projects shows that project's notes; on
    // Sessions / Ask AI, stay put — those pages follow the selection.
    if (pathname.startsWith('/notes')) go('/notes');
  };

  const navLink = (href: string, Icon: React.ElementType, label: string) => (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(rowClass(pathname === href || (href !== '/notes' && pathname.startsWith(`${href}/`))), collapsed && 'justify-center px-0')}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  const newNoteButton = (
    <span className={cn(rowClass(false), 'font-medium', collapsed && 'justify-center px-0')}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
        <Plus className="h-3.5 w-3.5" />
      </span>
      {!collapsed && <span>New note</span>}
    </span>
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        variant === 'desktop' && 'hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:flex',
        variant === 'desktop' && (collapsed ? 'w-14' : 'w-64'),
        variant === 'drawer' && 'w-full',
      )}
    >
      {/* Brand + search + collapse */}
      <div className={cn('flex h-12 shrink-0 items-center px-3', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <Link href="/notes" onClick={onNavigate} className="flex items-center gap-2 text-[15px] font-semibold">
            <Brain className="h-4 w-4" />
            Connecting Dots
          </Link>
        )}
        <div className="flex items-center gap-0.5">
          {!collapsed && (
            <button
              type="button"
              onClick={() => { openSearch(true); onNavigate?.(); }}
              aria-label="Search (⌘K)"
              title="Search (⌘K)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground cursor-pointer"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
          {variant === 'desktop' && (
            <button
              type="button"
              onClick={() => (collapsed ? expand() : collapse())}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground cursor-pointer"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Primary actions */}
      <nav className="space-y-0.5 px-2 pb-2">
        {activeProject ? (
          <Link href={`/notes/new?project=${activeProject.id}`} onClick={onNavigate} title={collapsed ? 'New note' : undefined}>
            {newNoteButton}
          </Link>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" className="w-full" title={collapsed ? 'New note' : undefined} />}>
              {newNoteButton}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px] text-muted-foreground">New note in…</DropdownMenuLabel>
                {projects.length === 0 && (
                  <DropdownMenuItem disabled className="text-[13px]">Create a project first</DropdownMenuItem>
                )}
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} className="text-[13px]" onClick={() => go(`/notes/new?project=${p.id}`)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {navLink('/notes', House, 'Home')}
        {navLink('/sessions', MessageSquare, 'Sessions')}
        {navLink('/ask', Sparkles, 'Ask AI')}
      </nav>

      {/* Projects + notes */}
      {!collapsed && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-3">
          <section className="space-y-0.5">
            <div className="flex items-center justify-between pr-1">
              <p className={sectionLabel}>Projects</p>
              <CreateProjectDialog iconOnly />
            </div>
            <button type="button" onClick={() => selectProject(null)} className={rowClass(activeProjectId === null)}>
              <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">All notes</span>
            </button>
            {visibleProjects.map((p) => (
              <div key={p.id} className="group/project relative">
                <button type="button" onClick={() => selectProject(p.id)} className={cn(rowClass(activeProjectId === p.id), 'pr-8')}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500/70" aria-hidden />
                  <span className="truncate">{p.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsProject(p)}
                  aria-label={`Settings for ${p.name}`}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground group-hover/project:opacity-100 focus-visible:opacity-100 cursor-pointer"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {(hiddenProjectCount > 0 || showAllProjects) && projects.length > PROJECTS_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllProjects((v) => !v)}
                className="w-full rounded-lg px-2.5 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                {showAllProjects ? 'Show fewer' : `Show ${hiddenProjectCount} more`}
              </button>
            )}
          </section>

          <section className="space-y-0.5">
            <p className={cn(sectionLabel, 'truncate')}>{activeProject ? activeProject.name : 'All notes'}</p>
            {notesLoading &&
              [...Array(5)].map((_, i) => <div key={i} className="mx-2.5 my-2 h-3.5 animate-pulse rounded bg-sidebar-accent" />)}
            {!notesLoading && notes.length === 0 && (
              <p className="px-2.5 py-1.5 text-[12px] text-muted-foreground">No notes yet.</p>
            )}
            {notes.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} onClick={onNavigate} className={rowClass(pathname === `/notes/${n.id}`)}>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', NOTE_ORIGINS[getNoteOrigin(n)].dotClass)} aria-hidden />
                <span className="truncate">{getDisplayTitle(n)}</span>
              </Link>
            ))}
          </section>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      <AccountRow collapsed={collapsed} />

      {settingsProject && (
        <ProjectSettingsDialog project={settingsProject} open onClose={() => setSettingsProject(null)} />
      )}
    </aside>
  );
}

function AccountRow({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const displayName = user?.email?.split('@')[0] ?? 'Account';

  const logout = () => {
    // Best-effort server-side revoke — the local session is cleared regardless.
    if (refreshToken) void authService.logout(refreshToken).catch(() => {});
    clearSession();
    router.push('/login');
  };

  const iconButton = 'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground cursor-pointer';

  return (
    <div className={cn('flex shrink-0 items-center border-t border-sidebar-border px-3 py-2.5', collapsed ? 'flex-col gap-1.5' : 'gap-2')}>
      <span
        title={user?.email ?? undefined}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground"
      >
        {displayName.slice(0, 1).toUpperCase()}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate text-[13px]">{displayName}</span>}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        className={iconButton}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button type="button" onClick={logout} aria-label="Log out" title="Log out" className={iconButton}>
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
