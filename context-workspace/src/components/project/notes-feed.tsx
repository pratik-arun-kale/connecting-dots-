'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { ChevronDown, ExternalLink, StickyNote } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { getContextPlatform, getSourceChip } from '@/lib/context-platform';
import { useCreateNote } from '@/lib/query';
import { projectService } from '@/lib/api/services';
import { QUERY_KEYS } from '@/lib/constants';
import type { ApiContext } from '@/types';

interface NotesFeedProps {
  projectId: string;
  /** ALL contexts — both extension/dashboard-authored notes and full
   *  conversation captures. This is the merge the redesign asked for:
   *  one stream, each card labeled "Captured" or "Mine", instead of two
   *  separate tabs that read like different features. */
  contexts: ApiContext[];
}

type FilterMode = 'all' | 'captured' | 'mine';

interface ContextMessage { role: string; content: string }

function getMessages(context: ApiContext): ContextMessage[] {
  const raw = context.raw_content as Record<string, unknown>;
  return (raw?.messages as ContextMessage[] | undefined) ?? [];
}

/** Card preview: plain, truncated (CSS line-clamp) text — not rendered
 *  Markdown, since clamping a multi-block rendered tree (headings/lists/
 *  tables) to N lines doesn't work the way clamping one text block does.
 *  Full Markdown rendering is reserved for the detail drawer. */
function getPreviewText(context: ApiContext): string {
  const messages = getMessages(context);
  let text: string;
  if (messages.length === 0) {
    text = '';
  } else if (messages.length === 1) {
    text = messages[0].content;
  } else {
    const firstUser = messages.find((m) => m.role === 'user');
    const firstOther = messages.find((m) => m.role !== 'user');
    text = [firstUser && `You asked: ${firstUser.content}`, firstOther?.content].filter(Boolean).join('\n\n');
  }
  // Collapse paragraph/line breaks and markdown emphasis markers into a
  // single flowing line for the card preview — a line-clamp on raw text
  // with \n\n paragraph breaks wastes clamp lines on blank space, showing
  // less actual content than a compact excerpt would. Full formatting
  // (real paragraphs, code blocks, etc.) still renders in the detail drawer.
  return text.replace(/\s*\n+\s*/g, ' ').replace(/[*_`#>-]/g, '').trim();
}

/** Notes have no real title ("[Note] <preview>" isn't meant for display) —
 *  derive one from the body. Captured conversations already have a real
 *  title (the page's actual title, cleaned up at capture time). */
function getDisplayTitle(context: ApiContext): string {
  if (getContextPlatform(context) !== 'note' && context.title) return context.title;
  const preview = getPreviewText(context);
  return preview.slice(0, 60) || 'Untitled';
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

const AUTOSAVE_DEBOUNCE_MS = 800;

function NoteComposer({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const createNote = useCreateNote(projectId);
  const queryClient = useQueryClient();

  // A note is created on the FIRST debounced pause; every pause after that
  // PATCHes the same context's content_md instead of creating a new one.
  const noteIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === lastSavedRef.current) return;
      setStatus('saving');
      try {
        if (!noteIdRef.current) {
          const { contextId } = await createNote.mutateAsync(trimmed);
          noteIdRef.current = contextId;
        } else {
          await projectService.updateNoteContent(noteIdRef.current, trimmed);
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.projects, projectId, QUERY_KEYS.contexts] });
        }
        lastSavedRef.current = trimmed;
        setStatus('saved');
      } catch {
        setStatus('idle'); // stays in the textarea untouched — next pause/blur retries
      }
    },
    [createNote, projectId, queryClient],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    setStatus('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void persist(value), AUTOSAVE_DEBOUNCE_MS);
  };

  const collapse = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void persist(text).finally(() => {
      setExpanded(false);
      setText('');
      setStatus('idle');
      noteIdRef.current = null;
      lastSavedRef.current = '';
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 mb-6">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground cursor-pointer"
        >
          <span aria-hidden>✎</span>
          <span>Write a note…</span>
        </button>
      ) : (
        <div className="space-y-1.5">
          <Textarea
            autoFocus
            value={text}
            onChange={handleChange}
            onBlur={collapse}
            placeholder="Write a note… (Markdown supported)"
            className="min-h-20 resize-none border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <p className="text-[10px] text-muted-foreground">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Autosaves as you type — click away when done.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Card (expands in place — no side drawer) ──────────────────────────────

/** TopNav's fixed height (h-16) — the floating header clone below docks
 *  right under it. Not responsive/variable, so a constant is safe here. */
const TOPNAV_HEIGHT_PX = 64;

function NoteCard({
  context, isExpanded, onToggle,
}: { context: ApiContext; isExpanded: boolean; onToggle: () => void }) {
  const chip = getSourceChip(context);
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
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
              chip.isNote
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-500'
            }`}
          >
            {chip.isNote ? 'Mine' : 'Captured'}
          </span>
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
      {!isExpanded && (
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {preview || <span className="italic">Empty</span>}
        </p>
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
          {messages.length <= 1 ? (
            <MarkdownContent content={messages[0]?.content ?? ''} />
          ) : (
            messages.map((m, i) => (
              <div key={i}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {m.role}
                </p>
                <MarkdownContent content={m.content} />
              </div>
            ))
          )}

          {chip.href && (
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
          )}

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

// ── Left sidebar list item (compact) ────────────────────────────────────

function NoteListItem({
  context, isActive, onClick,
}: { context: ApiContext; isActive: boolean; onClick: () => void }) {
  const chip = getSourceChip(context);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer',
        isActive ? 'bg-accent' : 'hover:bg-muted/50',
      )}
    >
      <div className="mb-0.5 flex items-center gap-2">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            chip.isNote ? 'bg-rose-500' : 'bg-indigo-500',
          )}
          aria-hidden
        />
        <p className="truncate text-[13px] font-semibold text-foreground">{getDisplayTitle(context)}</p>
      </div>
      <p className="line-clamp-1 pl-3.5 text-[11px] text-muted-foreground">
        {getPreviewText(context) || 'Empty'}
      </p>
    </button>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────

export function NotesFeed({ projectId, contexts }: NotesFeedProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  // The one note currently expanded in the center stream (accordion-style —
  // opening a different one collapses the previous). Clicking a left-sidebar
  // item sets this too, then the effect below scrolls that card into view.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedId) return;
    document.getElementById(`note-${expandedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [expandedId]);

  const sorted = useMemo(() => {
    const filtered = contexts.filter((c) => {
      if (filter === 'all') return true;
      const isNote = getContextPlatform(c) === 'note';
      return filter === 'mine' ? isNote : !isNote;
    });
    return [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [contexts, filter]);

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

  const filterOptions: Array<{ mode: FilterMode; label: string }> = [
    { mode: 'all', label: 'All' },
    { mode: 'captured', label: 'Captured' },
    { mode: 'mine', label: 'Mine' },
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left: filters + a compact, day-grouped list of every note — click
          any item to open it in the detail drawer (same drawer the center
          stream's cards open). */}
      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-64">
        <div className="mb-3 flex gap-1.5">
          {filterOptions.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                filter === mode
                  ? 'bg-indigo-500/10 text-indigo-500'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-10rem)]">
          {groups.map((group) => (
            <div key={group.label}>
              <h4 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </h4>
              <div className="space-y-0.5">
                {group.items.map((ctx) => (
                  <NoteListItem
                    key={ctx.id}
                    context={ctx}
                    isActive={expandedId === ctx.id}
                    onClick={() => setExpandedId(ctx.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: composer + the continuous passage stream. */}
      <div className="mx-auto w-full min-w-0 flex-1 lg:mx-0 lg:max-w-[720px]">
        <NoteComposer projectId={projectId} />

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/25 p-12 text-center">
            <StickyNote className="mb-3 w-8 h-8 text-muted-foreground/60" />
            <h4 className="mb-1 text-sm font-semibold text-foreground">No notes yet</h4>
            <p className="max-w-xs text-xs text-muted-foreground">
              Write one above, or select text on ChatGPT/Claude/Gemini and click{' '}
              <span className="font-semibold text-foreground">Save Note</span> in the extension.
            </p>
          </div>
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
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
