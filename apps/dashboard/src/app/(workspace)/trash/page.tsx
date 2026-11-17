'use client';

import React from 'react';
import { FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/layout/page';
import {
  useDeleteNoteForever,
  useDeleteProjectForever,
  useRestoreNote,
  useRestoreProject,
  useTrash,
} from '@/lib/query';
import { toast } from '@/store/toast-store';
import type { TrashedNote } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago". */
function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "in 27 days", "tomorrow", "today". */
function until(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

function noteTitle(n: TrashedNote): string {
  const raw = n.user_title || n.content_md || n.title || 'Untitled note';
  const line = raw.replace(/^\[Note\]\s*/, '').split('\n')[0].trim();
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

export default function TrashPage() {
  const { data, isLoading, isError, refetch } = useTrash();
  const restoreNote = useRestoreNote();
  const restoreProject = useRestoreProject();
  const deleteNote = useDeleteNoteForever();
  const deleteProject = useDeleteProjectForever();

  const failed = () => toast('That didn’t work. Try again.', { tone: 'error' });
  const confirmForever = (what: string) =>
    window.confirm(`Delete ${what} for good? This can’t be undone.`);

  const projects = data?.projects ?? [];
  const notes = data?.notes ?? [];
  const empty = !isLoading && !isError && projects.length === 0 && notes.length === 0;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <span className="text-foreground">Trash</span>
      </PageHeader>
      <PageBody className="pt-8">
        <h1 className="mb-1 font-note text-[2rem] font-medium tracking-tight text-foreground">Trash</h1>
        <p className="mb-8 text-[13px] text-muted-foreground">
          Deleted notes and projects stay here for {data?.retention_days ?? 30} days, then they’re removed for good.
        </p>

        {isLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-border/40 bg-muted/20" />
            ))}
          </div>
        )}

        {isError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px]">
            Couldn’t load the Trash.{' '}
            <button type="button" onClick={() => void refetch()} className="font-medium underline cursor-pointer">
              Try again
            </button>
          </div>
        )}

        {empty && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <Trash2 className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-[14px] font-medium">The Trash is empty</p>
            <p className="text-[13px] text-muted-foreground">Notes and projects you delete show up here.</p>
          </div>
        )}

        {projects.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Projects</h2>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {projects.map((p) => (
                <Row
                  key={p.id}
                  icon={<FolderOpen className="h-4 w-4" />}
                  title={p.name}
                  meta={`${p.notes_count} note${p.notes_count === 1 ? '' : 's'} · deleted ${ago(p.deleted_at)} · removed for good ${until(p.purge_at)}`}
                  onRestore={() =>
                    restoreProject.mutate(p.id, {
                      onSuccess: () => toast(`“${p.name}” restored.`),
                      onError: failed,
                    })
                  }
                  onDelete={() => {
                    if (!confirmForever(`“${p.name}” and its ${p.notes_count} notes`)) return;
                    deleteProject.mutate(p.id, { onError: failed });
                  }}
                />
              ))}
            </ul>
          </section>
        )}

        {notes.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Notes</h2>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {notes.map((n) => (
                <Row
                  key={n.id}
                  title={noteTitle(n)}
                  meta={`${n.project_name} · deleted ${ago(n.deleted_at)} · removed for good ${until(n.purge_at)}`}
                  onRestore={() =>
                    restoreNote.mutate(n.id, { onSuccess: () => toast('Note restored.'), onError: failed })
                  }
                  onDelete={() => {
                    if (!confirmForever('this note')) return;
                    deleteNote.mutate(n.id, { onError: failed });
                  }}
                />
              ))}
            </ul>
          </section>
        )}
      </PageBody>
    </div>
  );
}

function Row({
  icon,
  title,
  meta,
  onRestore,
  onDelete,
}: {
  icon?: React.ReactNode;
  title: string;
  meta: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-foreground">{title}</p>
        <p className="truncate text-[12px] text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onRestore}
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-foreground hover:bg-muted cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restore
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-destructive hover:bg-destructive/10 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete for good
        </button>
      </div>
    </li>
  );
}
