'use client';

import React from 'react';
import Link from 'next/link';
import { MessageSquare, Bookmark, ArrowUpRight } from 'lucide-react';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const formatLastActive = (dateStr: string) => {
    const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <Link href={`/projects/${project.id}`} className="group block rounded-2xl border border-[#e2e8f0] bg-white hover:border-[#cbd5e1] hover:shadow-sm transition-all duration-200 p-5">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: project.color + '18' }}
        >
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
        </div>
        <ArrowUpRight className="w-4 h-4 text-[#cbd5e1] group-hover:text-[#4f46e5] transition-colors shrink-0 mt-0.5" />
      </div>

      {/* Name */}
      <h3 className="text-[14px] font-semibold text-[#0f172a] group-hover:text-[#4f46e5] transition-colors truncate mb-1">
        {project.name}
      </h3>

      {/* Description */}
      <p className="text-[12px] text-[#94a3b8] line-clamp-2 leading-relaxed min-h-8 mb-4">
        {project.description || 'No description'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[#f1f5f9] text-[11px] text-[#94a3b8]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {project.sessionsCount}
          </span>
          <span className="flex items-center gap-1">
            <Bookmark className="w-3 h-3" />
            {project.contextsCount}
          </span>
        </div>
        <span>{formatLastActive(project.lastActiveAt)}</span>
      </div>
    </Link>
  );
}
