'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useUpdateProject, useDeleteProject } from '@/lib/query';
import type { Project } from '@/types';

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onClose: () => void;
}

export function ProjectSettingsDialog({ project, open, onClose }: ProjectSettingsDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [view, setView] = useState<'settings' | 'delete'>('settings');

  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // Sync form if project prop changes
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
  }, [project]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setView('settings');
      setDeleteConfirm('');
      updateProject.reset();
      deleteProject.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    updateProject.mutate(
      { id: project.id, data: { name: trimmedName, description: description.trim() || undefined } },
      { onSuccess: onClose }
    );
  };

  const handleDelete = () => {
    if (deleteConfirm !== project.name) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        onClose();
        router.push('/dashboard');
      },
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0]">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0f172a]">Project Settings</h2>
              <p className="text-[12px] text-[#94a3b8] mt-0.5 truncate max-w-[260px]">{project.name}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-[#e2e8f0]">
            {(['settings', 'delete'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                  view === tab
                    ? 'text-[#0f172a] border-b-2 border-[#0f172a]'
                    : 'text-[#94a3b8] hover:text-[#64748b]'
                }`}
              >
                {tab === 'settings' ? 'General' : 'Danger Zone'}
              </button>
            ))}
          </div>

          {/* General settings */}
          {view === 'settings' && (
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                  Project Name
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                  placeholder="Project name"
                  className="w-full h-10 px-3.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#0f172a] focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                  Description <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Describe what this project is about…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#0f172a] focus:bg-white resize-none transition-all"
                />
              </div>

              {updateProject.isError && (
                <p className="text-[12px] text-[#ef4444]">
                  Failed to save — please try again.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || name.trim() === project.name && description.trim() === (project.description ?? '') || updateProject.isPending}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold bg-[#0f172a] text-white hover:bg-[#1e293b] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {updateProject.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Danger zone */}
          {view === 'delete' && (
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#fef2f2] border border-[#fecaca]">
                <AlertTriangle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[13px] font-semibold text-[#dc2626]">Delete this project</p>
                  <p className="text-[12px] text-[#ef4444]/80 leading-relaxed">
                    This permanently deletes <strong>{project.name}</strong> and all its sessions, captured contexts, and indexed data. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-[#64748b]">
                  Type <span className="font-semibold text-[#0f172a]">{project.name}</span> to confirm
                </label>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={project.name}
                  className="w-full h-10 px-3.5 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#ef4444] focus:bg-white transition-all"
                />
              </div>

              {deleteProject.isError && (
                <p className="text-[12px] text-[#ef4444]">
                  Failed to delete — please try again.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium text-[#64748b] hover:bg-[#f1f5f9] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteConfirm !== project.name || deleteProject.isPending}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {deleteProject.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
                    : <><Trash2 className="w-3.5 h-3.5" /> Delete Project</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
