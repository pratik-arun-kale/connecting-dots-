'use client';

import React, { useMemo } from 'react';
import { PageBody, PageHeader } from '@/components/layout/page';
import { NotesFeed } from '@/components/project/notes-feed';
import { useNotes, useProjects } from '@/lib/query';
import { useWorkspaceStore } from '@/store';

export default function NotesHomePage() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const { data: projects = [] } = useProjects();
  const { data: notes = [], isLoading } = useNotes(activeProjectId);
  const project = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectNames = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const heading = project ? project.name : 'All notes';

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <span className="text-foreground">{heading}</span>
      </PageHeader>
      <PageBody className="pt-8">
        <h1 className="mb-1 font-note text-[2rem] font-medium tracking-tight text-foreground">{heading}</h1>
        <p className="mb-8 text-[13px] text-muted-foreground">
          {isLoading ? ' ' : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
          {!project && projects.length > 0 && ' · pick a project in the sidebar to write in it'}
        </p>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
            ))}
          </div>
        ) : (
          <NotesFeed
            key={activeProjectId ?? 'all'}
            projectId={project?.id ?? null}
            contexts={notes}
            projectNames={project ? undefined : projectNames}
          />
        )}
      </PageBody>
    </div>
  );
}
