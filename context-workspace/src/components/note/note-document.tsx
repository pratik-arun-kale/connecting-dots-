'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Calendar, ChevronRight, Code, ExternalLink, Heading2, List, ListChecks, MoreHorizontal, Plus, Quote, Table, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageBody, PageHeader } from '@/components/layout/page';
import { MarkdownContent } from '@/components/markdown/markdown-content';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NOTE_ORIGINS, getNoteOrigin, getSourceChip } from '@/lib/context-platform';
import { formatDate, getAutoTitle, getDisplayTitle, getMessages } from '@/lib/note-display';
import { useCreateNote, useDeleteNote, useUpdateNoteContent, useUpdateNoteTitle } from '@/lib/query';
import { useWorkspaceStore } from '@/store';
import type { ApiContext, Project } from '@/types';
import type { InsertableBlock, NoteEditorHandle } from '@/components/project/note-editor';

// BlockNote touches `document` at module init — client only.
const NoteEditor = dynamic(() => import('@/components/project/note-editor').then((m) => m.NoteEditor), { ssr: false });

const TITLE_DEBOUNCE_MS = 800;

const TOOLBAR: Array<{ type: InsertableBlock; label: string; icon: React.ElementType }> = [
  { type: 'heading', label: 'Heading', icon: Heading2 },
  { type: 'bulletListItem', label: 'Bulleted list', icon: List },
  { type: 'checkListItem', label: 'Checklist', icon: ListChecks },
  { type: 'table', label: 'Table', icon: Table },
  { type: 'codeBlock', label: 'Code block', icon: Code },
  { type: 'quote', label: 'Quote', icon: Quote },
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A note as a full page: editable serif title, meta chips, formatting
 * toolbar and body. With `note` null it's a new, not-yet-saved note in
 * `project`; the first body save creates it and swaps the URL to
 * /notes/{id} in place (no remount, so typing continues uninterrupted).
 */
export function NoteDocument({ note, project }: { note: ApiContext | null; project: Project | null }) {
  const router = useRouter();
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);
  const projectId = project?.id;

  // mutateAsync is stable across renders (the hook's return object isn't),
  // so callbacks below depend on it alone and keep a stable identity.
  const { mutateAsync: createNoteAsync } = useCreateNote(projectId ?? '');
  const { mutateAsync: updateContentAsync } = useUpdateNoteContent(projectId);
  const { mutateAsync: updateTitleAsync } = useUpdateNoteTitle(projectId);
  const deleteNote = useDeleteNote(projectId);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [title, setTitle] = useState(note?.user_title ?? '');

  const idRef = useRef<string | null>(note?.id ?? null);
  const lastBodyRef = useRef((note?.content_md ?? '').trim());
  const lastTitleRef = useRef((note?.user_title ?? '').trim());
  const titleRef = useRef(title);
  useEffect(() => { titleRef.current = title; }, [title]);
  const deletedRef = useRef(false);
  // Saves run one at a time: a second save arriving while the note is still
  // being created must not see "no id yet" and create a duplicate.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const editorHandle = useRef<NoteEditorHandle>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback((task: () => Promise<void>) => {
    chainRef.current = chainRef.current.then(async () => {
      if (deletedRef.current) return;
      try {
        await task();
      } catch {
        setStatus('error');
      }
    });
    return chainRef.current;
  }, []);

  const saveTitleNow = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!idRef.current || trimmed === lastTitleRef.current) return;
    setStatus('saving');
    await updateTitleAsync({ contextId: idRef.current, userTitle: trimmed });
    lastTitleRef.current = trimmed;
    setStatus('saved');
  }, [updateTitleAsync]);

  const saveBody = useCallback((markdown: string) => enqueue(async () => {
    const trimmed = markdown.trim();
    if (!trimmed || trimmed === lastBodyRef.current) return;
    setStatus('saving');
    if (!idRef.current) {
      if (!projectId) return;
      const { contextId } = await createNoteAsync(trimmed);
      idRef.current = contextId;
      window.history.replaceState(null, '', `/notes/${contextId}`);
      lastBodyRef.current = trimmed;
      // A title typed before the note existed is saved now that it does.
      await saveTitleNow(titleRef.current);
    } else {
      await updateContentAsync({ contextId: idRef.current, contentMd: trimmed });
      lastBodyRef.current = trimmed;
    }
    setStatus('saved');
  }), [enqueue, projectId, createNoteAsync, updateContentAsync, saveTitleNow]);

  const flushTitle = useCallback(() => {
    if (titleTimer.current) { clearTimeout(titleTimer.current); titleTimer.current = null; }
    return enqueue(() => saveTitleNow(titleRef.current));
  }, [enqueue, saveTitleNow]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => void flushTitle(), TITLE_DEBOUNCE_MS);
  };

  // On leaving the page, save a title still waiting on its debounce.
  const flushTitleRef = useRef(flushTitle);
  useEffect(() => { flushTitleRef.current = flushTitle; }, [flushTitle]);
  useEffect(() => () => { if (titleTimer.current) void flushTitleRef.current(); }, []);

  const handleDelete = () => {
    const id = idRef.current;
    if (!id) { router.push('/notes'); return; }
    if (!window.confirm('Delete this note? This removes it everywhere — it cannot be undone.')) return;
    deletedRef.current = true;
    deleteNote.mutate(id, { onSuccess: () => router.push('/notes') });
  };

  const isNew = note === null;
  const editable = isNew || getSourceChip(note).isNote;
  const chip = note ? getSourceChip(note) : null;
  const origin = note ? NOTE_ORIGINS[getNoteOrigin(note)] : NOTE_ORIGINS.written;
  const messages = note ? getMessages(note) : [];
  const placeholder = note ? getAutoTitle(note) : 'Untitled';
  const headerTitle = title.trim() || (note ? getDisplayTitle(note) : 'New note');

  const statusText = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Couldn’t save — retrying on next edit' }[status];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        actions={
          <>
            <span className={cn('mr-2 text-[11px]', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{statusText}</span>
            {chip?.href && (
              <a
                href={chip.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Open source</span>
              </a>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={handleDelete} className="text-[13px] text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        {project && (
          <>
            <button
              type="button"
              onClick={() => { setActiveProject(project.id); router.push('/notes'); }}
              className="max-w-40 truncate transition-colors hover:text-foreground cursor-pointer"
            >
              {project.name}
            </button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </>
        )}
        <span className="truncate text-foreground">{headerTitle}</span>
      </PageHeader>

      {editable && (
        <div className="sticky top-12 z-10 flex items-center gap-0.5 border-b border-border/60 bg-background/95 px-4 py-1 backdrop-blur md:px-6">
          {TOOLBAR.map(({ type, label, icon: Icon }) => (
            <ToolbarButton key={type} label={label} onClick={() => editorHandle.current?.insertBlock(type)}>
              <Icon className="h-4 w-4" />
            </ToolbarButton>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <ToolbarButton label="Insert… (or type /)" onClick={() => editorHandle.current?.openSlashMenu()}>
            <Plus className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <PageBody className="pt-10">
        <textarea
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={() => void flushTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editorHandle.current?.focus();
            }
          }}
          placeholder={placeholder}
          aria-label="Title"
          rows={1}
          className="block w-full resize-none overflow-hidden bg-transparent font-note text-[2rem] font-medium leading-tight tracking-tight text-foreground outline-none field-sizing-content placeholder:text-muted-foreground/45 md:text-[2.4rem]"
        />

        <div className="mt-4 mb-8 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(note?.created_at ?? new Date().toISOString())}
          </span>
          <Tooltip>
            <TooltipTrigger render={<span />} className={cn('rounded-md border px-2 py-0.5 font-medium', origin.chipClass)}>
              {origin.label}
            </TooltipTrigger>
            <TooltipContent>{origin.description}</TooltipContent>
          </Tooltip>
          {chip && chip.label !== 'Note' && (
            chip.href ? (
              <a href={chip.href} target="_blank" rel="noopener noreferrer" className="flex max-w-72 items-center gap-1 truncate rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground hover:text-foreground">
                <span className="truncate">{chip.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="max-w-72 truncate rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">{chip.label}</span>
            )
          )}
          {project && <span className="rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">{project.name}</span>}
        </div>

        {note?.prompt_text && (
          <div className="mb-6 rounded-lg bg-muted/40 px-4 py-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">You asked</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{note.prompt_text}</p>
          </div>
        )}

        {editable ? (
          <NoteEditor
            editable
            initialMarkdown={note ? (note.content_md ?? messages[0]?.content ?? '') : ''}
            placeholder={isNew ? 'Start writing… (type / for blocks)' : 'Write…'}
            onDebouncedChange={saveBody}
            handleRef={editorHandle}
            className="bn-note-page min-h-[40vh]"
          />
        ) : (
          <div className="space-y-6 font-note">
            {messages.map((m, i) => (
              <div key={i}>
                {messages.length > 1 && (
                  <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{m.role}</p>
                )}
                <MarkdownContent content={m.content} />
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        // Keep the editor's cursor where it is, so the block lands there.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
