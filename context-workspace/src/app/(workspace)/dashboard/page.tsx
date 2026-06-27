'use client';

import React, { useState } from 'react';
import { StatsBar } from '@/components/dashboard/stats-bar';
import { ProjectCard } from '@/components/dashboard/project-card';
import { CreateProjectDialog } from '@/components/dashboard/create-project-dialog';
import { useProjects } from '@/lib/query';
import { Download, FolderKanban } from 'lucide-react';
import { ProjectCardSkeleton } from '@/components/shared/loading-skeleton';

export default function DashboardPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [search, setSearch] = useState('');

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-7">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Dashboard</h1>
          <p className="text-[14px] text-[#64748b] mt-1">
            Plan, prioritize, and accomplish your AI workflow with ease.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CreateProjectDialog />
          <button className="flex items-center gap-2 h-9 px-4 rounded-xl border border-border bg-white text-[13px] font-medium text-[#0f172a] hover:bg-[#f8fafc] transition-colors">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export Data</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <StatsBar />

      {/* Projects panel — full width */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-[#94a3b8]" />
            <h2 className="text-[14px] font-semibold text-[#0f172a]">Projects</h2>
            {!isLoading && (
              <span className="text-[12px] text-[#94a3b8] font-normal">({filtered.length})</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 px-3 rounded-lg border border-border bg-[#f8fafc] text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#cbd5e1] transition-all w-48"
            />
            <CreateProjectDialog compact />
          </div>
        </div>

        {/* Grid list */}
        <div className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(6)].map((_, i) => <ProjectCardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[14px] font-medium text-[#64748b]">
                {search ? 'No projects match your search.' : 'No projects yet.'}
              </p>
              {!search && (
                <p className="text-[13px] text-[#94a3b8] mt-1">
                  Create your first project to start capturing AI conversations.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
