'use client';

import React from 'react';
import { useProjects } from '@/lib/query';
import { useWorkspaceStore } from '@/store';

/** Shown by project-scoped pages (Sessions, Ask AI) while "All notes" is selected. */
export function ChooseProject({ purpose }: { purpose: string }) {
  const { data: projects = [], isLoading } = useProjects();
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);

  return (
    <div className="rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
      <p className="mb-4 text-sm text-muted-foreground">Choose a project to {purpose}.</p>
      {isLoading ? null : projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">No projects yet — create one with + in the sidebar.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProject(p.id)}
              className="rounded-lg border border-border/60 bg-card px-3 py-1.5 text-[13px] text-foreground transition-colors hover:border-border hover:bg-muted/40 cursor-pointer"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
