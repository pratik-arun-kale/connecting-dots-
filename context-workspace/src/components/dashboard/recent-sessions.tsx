'use client';

import React from 'react';
import Link from 'next/link';
import { useSessions, useProjects } from '@/lib/query';
import { ArrowRight, Globe, Terminal, FileText } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-[#dcfce7] text-[#16a34a]',
  completed: 'bg-[#f1f5f9] text-[#64748b]',
  archived:  'bg-[#f1f5f9] text-[#94a3b8]',
};

const STATUS_LABELS: Record<string, string> = {
  active:    'Active',
  completed: 'Completed',
  archived:  'Archived',
};

export function RecentSessions() {
  const { data: sessions = [], isLoading } = useSessions();
  const { data: projects = [] } = useProjects();

  const recent = [...sessions]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 6);

  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Unknown';

  const getSourceIcon = (source: string) => {
    if (source === 'chrome') return <Globe className="w-3.5 h-3.5 text-[#3b82f6]" />;
    if (source === 'vscode') return <Terminal className="w-3.5 h-3.5 text-[#7c3aed]" />;
    return <FileText className="w-3.5 h-3.5 text-[#94a3b8]" />;
  };

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="text-[14px] font-semibold text-[#0f172a]">Team Collaboration</h2>
        <Link
          href="/sessions"
          className="text-[12px] font-medium text-[#4f46e5] hover:text-[#4338ca] flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-6 py-2.5 bg-[#f8fafc] border-b border-border">
        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider">Session</p>
        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider">Source</p>
        <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider">Status</p>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-[#f1f5f9] animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[#f1f5f9] rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-[#f1f5f9] rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))
        ) : recent.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] text-[#94a3b8]">No sessions recorded yet.</p>
          </div>
        ) : (
          recent.map((session) => {
            const status = session.status ?? 'completed';
            const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.completed;
            const initials = session.title.slice(0, 2).toUpperCase();
            return (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-6 py-4 hover:bg-[#f8fafc] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center text-[11px] font-bold text-[#64748b] shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#0f172a] truncate group-hover:text-[#4f46e5] transition-colors">
                      {session.title}
                    </p>
                    <p className="text-[11px] text-[#94a3b8] truncate">
                      Working on <span className="font-medium text-[#64748b]">{getProjectName(session.projectId)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                  {getSourceIcon(session.source)}
                  <span className="hidden sm:inline capitalize">{session.source}</span>
                </div>

                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${statusStyle}`}>
                  {STATUS_LABELS[status] ?? status}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
