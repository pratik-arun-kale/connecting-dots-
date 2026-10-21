'use client';

import React from 'react';
import { PageBody, PageHeader } from '@/components/layout/page';
import { ChooseProject } from '@/components/layout/choose-project';
import { SessionTimeline } from '@/components/project/session-timeline';
import { useProjectSessions, useProjects } from '@/lib/query';
import { useWorkspaceStore } from '@/store';

export default function SessionsPage() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === activeProjectId) ?? null;
  const { data: allSessions = [], isLoading } = useProjectSessions(project?.id ?? '');
  // Notes are sessions on the backend too, but they belong in Notes, not here.
  const sessions = allSessions.filter((s) => s.source_platform !== 'note');

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        {project && <span className="truncate">{project.name}</span>}
        {project && <span className="opacity-50">/</span>}
        <span className="text-foreground">Sessions</span>
      </PageHeader>
      <PageBody className="pt-8">
        <h1 className="mb-1 font-note text-[2rem] font-medium tracking-tight text-foreground">Sessions</h1>
        <p className="mb-8 text-[13px] text-muted-foreground">
          AI conversations opened for {project ? project.name : 'a project'}.
        </p>
        {!project ? (
          <ChooseProject purpose="see its AI sessions" />
        ) : isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border/40 bg-muted/20" />
            ))}
          </div>
        ) : (
          <SessionTimeline sessions={sessions} />
        )}
      </PageBody>
    </div>
  );
}
