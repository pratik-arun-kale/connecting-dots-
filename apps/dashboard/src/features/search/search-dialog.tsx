'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchStore, useWorkspaceStore } from '@/store';
import { useNotes, useProjects } from '@/lib/query';
import { NOTE_ORIGINS, getNoteOrigin } from '@/lib/context-platform';
import { getDisplayTitle, getPreviewText, matchesQuery } from '@/lib/note-display';
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';

const MAX_NOTES = 20;

/** ⌘K: jump to any note or project. Matching is client-side over the
 *  already-loaded note list, using the same rules as the notes search. */
export function SearchDialog() {
  const router = useRouter();
  const isOpen = useSearchStore((s) => s.isOpen);
  const setOpen = useSearchStore((s) => s.setOpen);
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const [query, setQuery] = useState('');

  const { data: projects = [] } = useProjects();
  const { data: notes = [] } = useNotes(null);
  const projectNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);

  const q = query.trim().toLowerCase();
  const matchingProjects = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects.slice(0, 5);
  const matchingNotes = (q ? notes.filter((n) => matchesQuery(n, q)) : notes).slice(0, MAX_NOTES);

  const close = (open: boolean) => {
    setOpen(open);
    if (!open) setQuery('');
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={close} title="Search" description="Find a note or project">
      <Command shouldFilter={false}>
        <CommandInput placeholder="Search notes and projects…" value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[360px] p-2">
          <CommandEmpty>No notes or projects match “{query}”.</CommandEmpty>

          {matchingNotes.length > 0 && (
            <CommandGroup heading={q ? 'Notes' : 'Recent notes'}>
              {matchingNotes.map((n) => (
                <CommandItem
                  key={n.id}
                  value={`note-${n.id}`}
                  onSelect={() => { close(false); router.push(`/notes/${n.id}`); }}
                  className="flex items-start gap-2.5 rounded-lg px-3 py-2 cursor-pointer"
                >
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', NOTE_ORIGINS[getNoteOrigin(n)].dotClass)} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{getDisplayTitle(n)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[n.project_id && projectNames[n.project_id], getPreviewText(n)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {matchingProjects.length > 0 && (
            <CommandGroup heading="Projects">
              {matchingProjects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project-${p.id}`}
                  onSelect={() => { close(false); setActiveProject(p.id); router.push('/notes'); }}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer"
                >
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
