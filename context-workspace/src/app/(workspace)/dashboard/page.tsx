'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { StatsBar } from '@/components/dashboard/stats-bar';
import { ProjectCard } from '@/components/dashboard/project-card';
import { RecentSessions } from '@/components/dashboard/recent-sessions';
import { CreateProjectDialog } from '@/components/dashboard/create-project-dialog';
import { useProjects } from '@/lib/query';
import { Input } from '@/components/ui/input';
import { Search, FolderKanban, Info } from 'lucide-react';
import { ProjectCardSkeleton } from '@/components/shared/loading-skeleton';

export default function DashboardPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter projects based on local search
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Dashboard"
        description="Monitor your active development sessions and captured workspace contexts."
      >
        <CreateProjectDialog />
      </PageHeader>

      {/* Metrics Bar */}
      <StatsBar />

      {/* Core Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Projects */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Active Projects
              </h2>
            </div>
            
            {/* Project Filter */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8.5 bg-muted/20 border-border/80 text-xs focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-xl border-border bg-card/20 min-h-[220px]">
              <Info className="w-8 h-8 text-muted-foreground/60 mb-3" />
              <h4 className="font-medium text-sm text-foreground mb-1">No Projects Found</h4>
              <p className="text-xs text-muted-foreground max-w-xs">
                {searchQuery ? 'Try adjusting your search criteria.' : 'Create a project to begin mapping context sessions.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Sessions */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span>Context Activity</span>
          </h2>
          <RecentSessions />
        </div>
      </div>
    </div>
  );
}
