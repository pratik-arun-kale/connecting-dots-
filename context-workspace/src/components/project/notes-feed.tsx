'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { ChevronDown, ExternalLink, Search, StickyNote, Trash2, X } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NOTE_ORIGINS, getContextPlatform, getNoteOrigin, getSourceChip, type NoteOrigin } from '@/lib/context-platform';
import { useCreateNote, useDeleteNote, useUpdateNoteContent } from '@/lib/query';
import type { ApiContext } from '@/types';
import type { NoteEditorHandle } from './note-editor';

// BlockNote/ProseMirror touches `document` at module init — must not run
// during SSR/static generation, hence the dynamic import.
const NoteEditor = dynamic(() => import('./note-editor').then((m) => m.NoteEditor), { ssr: false });
// Same editor; its loading state stands in for the placeholder during the
// brief moment after page load before the editor's code has arrived.
const ComposerEditor = dynamic(() => import('./note-editor').then((m) => m.NoteEditor), {
  ssr: false,
  loading: () => <p className="py-0.75 font-note text-sm text-muted-foreground/70">Write a note…</p>,
});

interface NotesFeedProps {
  projectId: string;
  /** ALL contexts — both extension/dashboard-authored notes and full
   *  conversation captures. This is the merge the redesign asked for:
   *  one stream, each card labeled Captured / Selected / Written, instead of two
   *  separate tabs that read like different features. */
  contexts: ApiContext[];
}

type FilterMode = 'all' | NoteOrigin;

interface ContextMessage { role: string; content: string }

function getMessages(context: ApiContext): ContextMessage[] {
  const raw = context.raw_content as Record<string, unknown>;
  return (raw?.messages as ContextMessage[] | undefined) ?? [];
}

/** One Markdown line as plain text: drops block markers (heading, bullet,
 *  numbering, quote, checkbox), link syntax and emphasis/code markers, but
 *  keeps hyphens and underscores inside words. */
function stripMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|\*|~~|`)(\S(?:.*?\S)?)\1/g, '$2')
    .trim();
}

/** The card's text as plain lines. Notes read content_md: that's where
 *  edits land — raw_content.messages is the immutable first-save snapshot
 *  (for a composer note, only the words typed before the first autosave). */
function getBodyLines(context: ApiContext): string[] {
  const messages = getMessages(context);
  let text: string;
  if (getContextPlatform(context) === 'note') {
    text = context.content_md ?? messages[0]?.content ?? '';
  } else if (messages.length <= 1) {
    text = messages[0]?.content ?? '';
  } else {
    const firstUser = messages.find((m) => m.role === 'user');
    const firstOther = messages.find((m) => m.role !== 'user');
    text = [firstUser && `You asked: ${firstUser.content}`, firstOther?.content].filter(Boolean).join('\n');
  }
  return text.split('\n').map(stripMarkdownLine).filter(Boolean);
}

/** Notes have no real title ("[Note] <first 80 chars>" isn't meant for
 *  display), so their first line serves as one. Captured conversations
 *  already have a real title (the page's title, cleaned up at capture). */
function getDisplayTitle(context: ApiContext): string {
  if (getContextPlatform(context) !== 'note' && context.title) return context.title;
  return getBodyLines(context)[0] ?? 'Untitled';
}

/** Card preview, as one flowing line for CSS line-clamp (clamping rendered
 *  Markdown doesn't work). For notes it starts after the first line, which
 *  is already shown as the title. */
function getPreviewText(context: ApiContext): string {
  const lines = getBodyLines(context);
  return (getContextPlatform(context) === 'note' ? lines.slice(1) : lines).join(' ');
}

/** Every whitespace-separated term must appear somewhere in the note. */
function matchesQuery(context: ApiContext, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    getDisplayTitle(context),
    getSourceChip(context).label,
    context.page_title,
    context.prompt_text,
    context.content_md ?? getMessages(context).map((m) => m.content).join('\n'),
  ].filter(Boolean).join('\n').toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

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

// ── Card (expands in place — no side drawer) ──────────────────────────────

/** TopNav's fixed height (h-16) — the floating header clone below docks
 *  right under it. Not responsive/variable, so a constant is safe here. */
const TOPNAV_HEIGHT_PX = 64;

function NoteCard({
  context, isExpanded, onToggle, onDelete, isDeleting, onSave,
}: {
  context: ApiContext;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onSave: (markdown: string) => void;
}) {
  const chip = getSourceChip(context);
  const origin = NOTE_ORIGINS[getNoteOrigin(context)];
  const preview = getPreviewText(context);
  const messages = getMessages(context);

  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [floatingRect, setFloatingRect] = useState<{ left: number; width: number } | null>(null);
  const [showFloating, setShowFloating] = useState(false);

  // position:sticky turned out to be unreliable for this — instead of
  // depending on it, or on guessing which ancestor's overflow/stacking was
  // interfering, this renders a second, position:fixed copy of the header
  // once the real (in-flow) one scrolls out of view. `fixed` is always
  // relative to the viewport (confirmed no ancestor sets a transform/
  // filter, which is the one thing that would redirect it), so this can't
  // be broken by anything upstream in the layout.
  useEffect(() => {
    if (!isExpanded) {
      setShowFloating(false);
      return;
    }
    const measure = () => {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setFloatingRect({ left: rect.left, width: rect.width });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Not intersecting AND above the root (top < 0), not below it —
        // i.e. actually scrolled past, not just "not reached yet".
        setShowFloating(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: `-${TOPNAV_HEIGHT_PX}px 0px 0px 0px` },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [isExpanded]);

  const headerInner = (
    <>
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
          <span className="truncate text-xs font-medium text-muted-foreground">{chip.label}</span>
          {chip.href && <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground/60" />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <time className="text-[10px] text-muted-foreground/70">{formatTime(context.created_at)}</time>
          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground/60 transition-transform', isExpanded && 'rotate-180')} />
        </div>
      </div>

      <p className={cn('mb-1 text-[15px] font-semibold leading-snug text-foreground', !isExpanded && 'line-clamp-1')}>
        {getDisplayTitle(context)}
      </p>
      {/* A one-line note is fully shown by its title — no preview needed. */}
      {!isExpanded && preview && (
        <p className="line-clamp-3 font-note text-sm leading-relaxed text-muted-foreground">{preview}</p>
      )}
    </>
  );

  return (
    <div
      ref={cardRef}
      id={`note-${context.id}`}
      className={cn(
        'relative mb-3 rounded-xl border border-border/60 transition-all hover:border-border scroll-mt-4',
        isExpanded ? 'bg-card' : 'bg-card/50',
      )}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="block w-full rounded-t-xl p-4 text-left cursor-pointer"
      >
        {headerInner}
      </button>

      {isExpanded && showFloating && floatingRect && (
        <div
          className="fixed z-30 rounded-b-xl border-b border-border/40 bg-card shadow-md"
          style={{ top: TOPNAV_HEIGHT_PX, left: floatingRect.left, width: floatingRect.width }}
        >
          <button type="button" onClick={onToggle} aria-expanded={isExpanded} className="block w-full p-4 text-left cursor-pointer">
            {headerInner}
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
          {context.prompt_text && (
            <>
              <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">You asked</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{context.prompt_text}</p>
              </div>
              <p className="-mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Response</p>
            </>
          )}
          {chip.isNote ? (
            // Written notes are click-anywhere-to-edit — no separate edit
            // mode/button, matching the Notion feel. Captured chat
            // transcripts below stay read-only: they're not user-authored.
            <NoteEditor
              editable
              initialMarkdown={context.content_md ?? messages[0]?.content ?? ''}
              onDebouncedChange={onSave}
              className="min-h-16"
            />
          ) : messages.length <= 1 ? (
            <div className="font-note">
              <MarkdownContent content={messages[0]?.content ?? ''} />
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {m.role}
                </p>
                <div className="font-note">
                  <MarkdownContent content={m.content} />
                </div>
              </div>
            ))
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            {chip.href ? (
              <a
                href={chip.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:text-indigo-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open source
              </a>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Delete this note? This removes it everywhere — it cannot be undone.')) {
                  onDelete();
                }
              }}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-default cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>

          {/* Annotation field + "Related notes" are deferred: annotating an
              existing capture needs a backend field that doesn't exist yet
              (contexts are immutable once captured), and "related" needs a
              similarity lookup (the RAG retrieval pipeline could power
              this, but it's not wired to a per-context "find similar"
              query today). Both are natural follow-ups once there's a
              backend endpoint for either. */}
        </div>
      )}
    </div>
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

export function NotesFeed({ projectId, contexts }: NotesFeedProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [query, setQuery] = useState('');
  // The one note currently expanded (accordion-style — opening a different
  // one collapses the previous).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deleteNote = useDeleteNote(projectId);
  const updateNote = useUpdateNoteContent(projectId);

  useEffect(() => {
    if (!expandedId) return;
    document.getElementById(`note-${expandedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [expandedId]);

  const handleDelete = (contextId: string) => {
    deleteNote.mutate(contextId, {
      onSuccess: () => setExpandedId((prev) => (prev === contextId ? null : prev)),
    });
  };

  const handleSave = (contextId: string, markdown: string) => {
    if (!markdown.trim()) return; // never autosave a note down to empty
    updateNote.mutate({ contextId, contentMd: markdown });
  };

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
    <div className="mx-auto w-full min-w-0 max-w-180">
      <NoteComposer projectId={projectId} />

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
              placeholder="Search this project’s notes…"
              aria-label="Search this project’s notes"
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
            Write one above, or select text on ChatGPT/Claude/Gemini and click{' '}
            <span className="font-semibold text-foreground">Save Note</span> in the extension.
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
                isExpanded={expandedId === ctx.id}
                onToggle={() => setExpandedId((prev) => (prev === ctx.id ? null : ctx.id))}
                onDelete={() => handleDelete(ctx.id)}
                isDeleting={deleteNote.isPending && deleteNote.variables === ctx.id}
                onSave={(markdown) => handleSave(ctx.id, markdown)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
