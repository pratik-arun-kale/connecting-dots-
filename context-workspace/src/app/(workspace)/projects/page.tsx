'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectCard } from '@/components/dashboard/project-card';
import { CreateProjectDialog } from '@/components/dashboard/create-project-dialog';
import { useProjects } from '@/lib/query';
import { Input } from '@/components/ui/input';
import { Search, FolderKanban, HelpCircle } from 'lucide-react';
import { ProjectCardSkeleton } from '@/components/shared/loading-skeleton';

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage your development workspaces, tasks, and context boundaries."
      >
        <CreateProjectDialog />
      </PageHeader>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search projects by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/20 border-border focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Showing {filteredProjects.length} of {projects.length} projects
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl border-border bg-card/20 min-h-[300px]">
          <FolderKanban className="w-10 h-10 text-muted-foreground/50 mb-3 animate-pulse" />
          <h3 className="font-semibold text-lg text-foreground mb-1">No Projects Found</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-6">
            {searchQuery
              ? 'No projects matched your search criteria. Try typing something else.'
              : 'Create a new project workspace to start sharing context with your assistant.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
