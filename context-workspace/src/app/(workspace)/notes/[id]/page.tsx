'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NoteDocument } from '@/components/note/note-document';
import { PageBody } from '@/components/layout/page';
import { useNote, useNotes, useProjects } from '@/lib/query';

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading, isError } = useNote(id);
  const { data: projects = [] } = useProjects();
  // The single-note response has no project_id; the cross-project list does.
  const { data: allNotes = [] } = useNotes(null);
  const projectId = note?.project_id ?? allNotes.find((n) => n.id === id)?.project_id;
  const project = projects.find((p) => p.id === projectId) ?? null;

  if (isLoading) {
    return (
      <PageBody className="space-y-4 pt-20">
        <div className="h-10 w-2/3 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted/30" />
        <div className="h-40 animate-pulse rounded bg-muted/20" />
      </PageBody>
    );
  }

  if (isError || !note) {
    return (
      <PageBody className="pt-24 text-center">
        <h1 className="mb-2 font-note text-2xl text-foreground">Note not found</h1>
        <p className="mb-6 text-sm text-muted-foreground">It may have been deleted.</p>
        <Link href="/notes" className="text-sm font-medium text-indigo-500 hover:text-indigo-400">Back to all notes</Link>
      </PageBody>
    );
  }

  // key: a different note is a fresh document (editor, title, save state).
  return <NoteDocument key={note.id} note={note} project={project} />;
}
