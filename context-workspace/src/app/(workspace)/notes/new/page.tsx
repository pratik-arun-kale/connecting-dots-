'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { NoteDocument } from '@/components/note/note-document';
import { PageBody } from '@/components/layout/page';
import { useProjects } from '@/lib/query';

// useSearchParams() must sit under a Suspense boundary in the App Router.
export default function NewNotePage() {
  return (
    <Suspense fallback={null}>
      <NewNote />
    </Suspense>
  );
}

function NewNote() {
  const searchParams = useSearchParams();
  // Read once: after the first save, NoteDocument swaps the URL to
  // /notes/{id} (dropping ?project=), and this page must keep rendering the
  // same document — not fall back to "choose a project" mid-typing.
  const [projectId] = useState(() => searchParams.get('project'));
  const { data: projects = [], isLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId) ?? null;

  if (isLoading) return null;

  if (!project) {
    return (
      <PageBody className="pt-24 text-center">
        <h1 className="mb-2 font-note text-2xl text-foreground">Choose a project first</h1>
        <p className="mb-6 text-sm text-muted-foreground">New notes go into a project — pick one in the sidebar.</p>
        <Link href="/notes" className="text-sm font-medium text-indigo-500 hover:text-indigo-400">Back to all notes</Link>
      </PageBody>
    );
  }

  return <NoteDocument note={null} project={project} />;
}
