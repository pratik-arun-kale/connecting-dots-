'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Search, StickyNote, X } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NOTE_ORIGINS, getNoteOrigin, getSourceChip, type NoteOrigin } from '@/lib/context-platform';
import { useCreateNote, useUpdateNoteContent } from '@/lib/query';
import type { ApiContext } from '@/types';
import { dayLabel, formatTime, getDisplayTitle, getPreviewText, matchesQuery } from '@/lib/note-display';
import type { NoteEditorHandle } from './note-editor';

// BlockNote/ProseMirror touches `document` at module init — client only. Its
// loading state stands in for the placeholder during the brief moment after
// page load before the editor's code has arrived.
const ComposerEditor = dynamic(() => import('./note-editor').then((m) => m.NoteEditor), {
  ssr: false,
  loading: () => <p className="py-0.75 font-note text-sm text-muted-foreground/70">Write a note…</p>,
});

interface NotesFeedProps {
  /** The project new notes go into; null = "All notes" (no composer). */
  projectId: string | null;
  /** Notes and conversation captures, one stream, each labeled
   *  Captured / Selected / Written. */
  contexts: ApiContext[];
  /** Project names by id, shown on cards when listing across projects. */
  projectNames?: Record<string, string>;
}

type FilterMode = 'all' | NoteOrigin;

// ── Composer ("Take a note…" bar — Google Keep style) ───────────────────────

function NoteComposer({ projectId }: { projectId: string }) {
  // The editor stays mounted, styled as the collapsed bar: mounting it on
  // click took ~0.5s, and anything typed in that gap was lost. `sessionKey`
  // remounts a fresh, empty editor after a note is finished.
  const [active, setActive] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const createNote = useCreateNote(projectId);
  const updateNote = useUpdateNoteContent(projectId);

  // A note is created on the FIRST save; every save after that PATCHes the
  // same context's content_md instead of creating a new one.
  const noteIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef('');
  // Saves run strictly one after another: otherwise a second save arriving
  // while the first create is still in flight would see no noteId yet and
  // create a duplicate note.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(
    (markdown: string) => {
      const run = async () => {
        const trimmed = markdown.trim();
        if (!trimmed || trimmed === lastSavedRef.current) return;
        setStatus('saving');
        try {
          if (!noteIdRef.current) {
            const { contextId } = await createNote.mutateAsync(trimmed);
            noteIdRef.current = contextId;
          } else {
            await updateNote.mutateAsync({ contextId: noteIdRef.current, contentMd: trimmed });
          }
          lastSavedRef.current = trimmed;
          setStatus('saved');
        } catch {
          setStatus('idle'); // content stays in the editor — the next pause retries
        }
      };
      saveChainRef.current = saveChainRef.current.then(run);
      return saveChainRef.current;
    },
    [createNote, updateNote],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const editorHandle = useRef<NoteEditorHandle>(null);
  const closingRef = useRef(false);

  // Closes on click-outside or Esc rather than on blur: BlockNote's slash
  // menu and toolbars take focus when clicked, so blur fired mid-edit and
  // collapsed the composer. Saves everything before resetting, so the next
  // note starts fresh instead of overwriting this one.
  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    await editorHandle.current?.flush();
    await saveChainRef.current;
    const wroteNote = noteIdRef.current !== null;
    setActive(false);
    setStatus('idle');
    noteIdRef.current = null;
    lastSavedRef.current = '';
    // Only remount when a note was actually saved — clicking in and out of
    // an empty composer shouldn't rebuild the editor.
    if (wroteNote) setSessionKey((k) => k + 1);
    else (document.activeElement as HTMLElement | null)?.blur();
    closingRef.current = false;
  }, []);

  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || containerRef.current?.contains(target)) return;
      if (target.closest('.bn-root, .bn-shadcn')) return; // BlockNote UI portalled elsewhere
      void close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [active, close]);

  return (
    <div
      ref={containerRef}
      onFocusCapture={() => setActive(true)}
      // Clicks on the padding around the text still start writing.
      onPointerDown={(e) => {
        if (!(e.target as Element).closest('.bn-root')) {
          e.preventDefault();
          editorHandle.current?.focus();
        }
      }}
      // Capture phase: BlockNote marks every Esc as handled, so check first.
      // With the slash menu open, Esc belongs to BlockNote (closes the
      // menu); otherwise it closes the composer.
      onKeyDownCapture={(e) => {
        if (!active || e.key !== 'Escape') return;
        if (containerRef.current?.querySelector('[class*="bn-suggestion-menu"]')) return;
        void close();
      }}
      className={cn(
        'mb-6 cursor-text rounded-xl border p-3 transition-colors',
        active ? 'border-border bg-card' : 'border-border/60 bg-card/60',
      )}
    >
      <ComposerEditor
        key={sessionKey}
        editable
        placeholder="Write a note…"
        onDebouncedChange={persist}
        handleRef={editorHandle}
        className={cn(active && 'min-h-20')}
      />
      {active && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved'
              ? 'Saved ✓'
              : 'Autosaves as you type · type / for headings, lists, checklists · Esc or click outside when done'}
        </p>
      )}
    </div>
  );
}

// ── Card (opens the note's own page) ─────────────────────────────────────

function NoteCard({ context, projectName }: { context: ApiContext; projectName?: string }) {
  const chip = getSourceChip(context);
  const origin = NOTE_ORIGINS[getNoteOrigin(context)];
  const preview = getPreviewText(context);

  return (
    <Link
      href={`/notes/${context.id}`}
      id={`note-${context.id}`}
      className="mb-3 block rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={<span />}
              className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold', origin.chipClass)}
            >
              {origin.label}
            </TooltipTrigger>
            <TooltipContent>{origin.description}</TooltipContent>
          </Tooltip>
          <span className="truncate text-xs font-medium text-muted-foreground">
            {projectName ? `${projectName} · ${chip.label}` : chip.label}
          </span>
        </div>
        <time className="shrink-0 text-[10px] text-muted-foreground/70">{formatTime(context.created_at)}</time>
      </div>
      <p className="mb-1 line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">{getDisplayTitle(context)}</p>
      {/* A one-line note is fully shown by its title — no preview needed. */}
      {preview && <p className="line-clamp-3 font-note text-sm leading-relaxed text-muted-foreground">{preview}</p>}
    </Link>
  );
}

// ── Filter bar (its colored dots double as the legend) ──────────────────

function FilterBar({
  filter, onChange, options,
}: { filter: FilterMode; onChange: (mode: FilterMode) => void; options: FilterMode[] }) {
  const buttonClass = (mode: FilterMode) => cn(
    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
    filter === mode
      ? 'bg-accent text-foreground'
      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((mode) => {
        if (mode === 'all') {
          return (
            <button key={mode} type="button" onClick={() => onChange(mode)} className={buttonClass(mode)}>
              All
            </button>
          );
        }
        const origin = NOTE_ORIGINS[mode];
        return (
          <Tooltip key={mode}>
            <TooltipTrigger onClick={() => onChange(mode)} className={buttonClass(mode)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', origin.dotClass)} aria-hidden />
              {origin.label}
            </TooltipTrigger>
            <TooltipContent>{origin.description}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────

export function NotesFeed({ projectId, contexts, projectNames }: NotesFeedProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    const filtered = contexts.filter(
      (c) => (filter === 'all' || getNoteOrigin(c) === filter) && matchesQuery(c, query),
    );
    return [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contexts, filter, query]);

  const groups = useMemo(() => {
    const result: Array<{ label: string; items: ApiContext[] }> = [];
    for (const ctx of sorted) {
      const label = dayLabel(ctx.created_at);
      const last = result[result.length - 1];
      if (last?.label === label) last.items.push(ctx);
      else result.push({ label, items: [ctx] });
    }
    return result;
  }, [sorted]);

  const filterOptions: FilterMode[] = ['all', 'captured', 'selected', 'written'];

  return (
    <div className="w-full min-w-0">
      {projectId && <NoteComposer projectId={projectId} />}

      {contexts.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <InputGroup className="h-9 bg-card/60">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
              placeholder={projectId ? 'Search this project’s notes…' : 'Search all notes…'}
              aria-label="Search notes"
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" onClick={() => setQuery('')} aria-label="Clear search">
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <FilterBar filter={filter} onChange={setFilter} options={filterOptions} />
        </div>
      )}

      {contexts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/25 p-12 text-center">
          <StickyNote className="mb-3 w-8 h-8 text-muted-foreground/60" />
          <h4 className="mb-1 text-sm font-semibold text-foreground">No notes yet</h4>
          <p className="max-w-xs text-xs text-muted-foreground">
            {projectId ? 'Write one above, or select' : 'Pick a project in the sidebar to write one, or select'} text on
            ChatGPT/Claude/Gemini and click <span className="font-semibold text-foreground">Save Note</span> in the extension.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {query ? <>No notes match “{query}”.</> : 'No notes of this kind yet.'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-5">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </h4>
            {group.items.map((ctx) => (
              <NoteCard
                key={ctx.id}
                context={ctx}
                projectName={projectNames && ctx.project_id ? projectNames[ctx.project_id] : undefined}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
