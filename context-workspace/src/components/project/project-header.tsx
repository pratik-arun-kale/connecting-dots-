'use client';

import React, { useState } from 'react';
import { MessageSquare, Bookmark, Calendar, Settings } from 'lucide-react';
import { ProjectSettingsDialog } from './project-settings-dialog';
import type { Project } from '@/types';

interface ProjectHeaderProps {
  project: Project;
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="space-y-4 pb-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Title */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-[24px] font-bold tracking-tight text-[#0f172a] truncate">
                {project.name}
              </h1>
            </div>
            {project.description && (
              <p className="text-[14px] text-[#64748b] max-w-2xl leading-relaxed">
                {project.description}
              </p>
            )}
          </div>

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-[#e2e8f0] bg-white text-[13px] font-medium text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a] hover:border-[#cbd5e1] transition-all shrink-0 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[#94a3b8]">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="font-semibold text-[#0f172a]">{project.sessionsCount}</span> sessions
          </span>
          <span className="flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5" />
            <span className="font-semibold text-[#0f172a]">{project.contextsCount}</span> contexts
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Created {new Date(project.createdAt).toLocaleDateString(undefined, {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </span>
        </div>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
