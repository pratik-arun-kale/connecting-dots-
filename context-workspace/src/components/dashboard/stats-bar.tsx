'use client';

import React from 'react';
import { useProjects, useSessions, useContexts } from '@/lib/query';
import { ArrowUpRight } from 'lucide-react';

export function StatsBar() {
  const { data: projects = [], isLoading: lp } = useProjects();
  const { data: sessions = [], isLoading: ls } = useSessions();
  const { data: contexts = [], isLoading: lc } = useContexts();
  const isLoading = lp || ls || lc;

  const activeSessions = sessions.filter((s) => s.status === 'active');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Featured card — dark */}
      <div className="rounded-2xl bg-[#0f172a] p-5 text-white flex flex-col justify-between min-h-[120px]">
        <div className="flex items-start justify-between">
          <p className="text-[13px] font-medium text-white/60">Total Projects</p>
          <button className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
          </button>
        </div>
        <div>
          {isLoading ? (
            <div className="w-12 h-8 bg-white/10 rounded-lg animate-pulse" />
          ) : (
            <p className="text-[36px] font-bold leading-none">{projects.length}</p>
          )}
          <p className="text-[11px] text-white/40 mt-1.5">All workspace projects</p>
        </div>
      </div>

      {/* Light cards */}
      {[
        { label: 'Total Sessions',   value: sessions.length,       sub: 'Across all projects' },
        { label: 'Saved Contexts',   value: contexts.length,       sub: 'Captured conversations' },
        { label: 'Active Sessions',  value: activeSessions.length, sub: 'Currently running' },
      ].map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white border border-border p-5 flex flex-col justify-between min-h-[120px]">
          <div className="flex items-start justify-between">
            <p className="text-[13px] font-medium text-[#64748b]">{stat.label}</p>
            <button className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-[#f8fafc] transition-colors">
              <ArrowUpRight className="w-3.5 h-3.5 text-[#94a3b8]" />
            </button>
          </div>
          <div>
            {isLoading ? (
              <div className="w-10 h-8 bg-[#f1f5f9] rounded-lg animate-pulse" />
            ) : (
              <p className="text-[36px] font-bold text-[#0f172a] leading-none">{stat.value}</p>
            )}
            <p className="text-[11px] text-[#94a3b8] mt-1.5">{stat.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
