'use client';

import React from 'react';
import { PageBody, PageHeader } from '@/components/layout/page';
import { ChooseProject } from '@/components/layout/choose-project';
import { ConversationSearchPanel } from '@/components/project/conversation-search-panel';
import { RagQueryPanel } from '@/components/project/rag-query-panel';
import { useNotes, useProjects } from '@/lib/query';
import { useWorkspaceStore } from '@/store';

export default function AskPage() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === activeProjectId) ?? null;
  const { data: notes = [] } = useNotes(project?.id ?? null);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        {project && <span className="truncate">{project.name}</span>}
        {project && <span className="opacity-50">/</span>}
        <span className="text-foreground">Ask AI</span>
      </PageHeader>
      <PageBody className="pt-8">
        <h1 className="mb-1 font-note text-[2rem] font-medium tracking-tight text-foreground">Ask AI</h1>
        <p className="mb-8 text-[13px] text-muted-foreground">
          Search and ask questions across {project ? `${project.name}’s` : 'a project’s'} notes and captured conversations.
        </p>
        {!project ? (
          <ChooseProject purpose="ask about its notes" />
        ) : (
          <div key={project.id} className="space-y-8">
            <ConversationSearchPanel projectId={project.id} />
            <div className="border-t border-border/40 pt-6">
              <RagQueryPanel projectId={project.id} chunksIndexed={notes.length * 3} />
            </div>
          </div>
        )}
      </PageBody>
    </div>
  );
}
