'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as z from 'zod';
import { Plus, Loader2, Bot, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateProjectWithSessions } from '@/lib/query';
import { extensionService } from '@/lib/services/extension.service';
import type { Platform } from '@/types';

const PLATFORMS: { id: Platform; label: string; domain: string }[] = [
  { id: 'chatgpt', label: 'ChatGPT', domain: 'chat.openai.com' },
  { id: 'claude', label: 'Claude', domain: 'claude.ai' },
  { id: 'gemini', label: 'Gemini', domain: 'gemini.google.com' },
];

const schema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
});

type FormValues = z.infer<typeof schema>;

export function CreateProjectDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [platformError, setPlatformError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const router = useRouter();
  const createProjectWithSessions = useCreateProjectWithSessions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const togglePlatform = (platform: Platform) => {
    setPlatformError('');
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const onSubmit = (data: FormValues) => {
    setSubmitError('');

    if (selectedPlatforms.length === 0) {
      setPlatformError('Select at least one AI platform');
      return;
    }

    console.log('[DEBUG] onSubmit → name:', data.name, '| platforms:', selectedPlatforms);

    createProjectWithSessions.mutate(
      { name: data.name, platforms: selectedPlatforms },
      {
        onSuccess: (result) => {
          console.log('[DEBUG] mutation onSuccess → project:', result.project.id, '| sessions:', result.sessions.length);

          // ── Step 1: close dialog and navigate immediately ─────────────────
          reset();
          setSelectedPlatforms([]);
          setSubmitError('');
          setOpen(false);
          router.push(`/projects/${result.project.id}`);

          // ── Step 2: fire-and-forget extension messaging ───────────────────
          // Project creation is already complete. Extension failure is non-fatal.
          // The useCreateProjectWithSessions hook also sends these messages in onSuccess,
          // but we keep this here for immediate feedback logging.
          for (const session of result.sessions) {
            extensionService
              .createProviderSession(session.id, result.project.id, session.source_platform, null)
              .then((res: { success: boolean; error?: string }) => {
                console.log('[DEBUG] extension CREATE_PROVIDER_SESSION result:', res);
              })
              .catch((err: unknown) => {
                console.warn('[DEBUG] extension messaging failed (non-fatal):', err);
              });
          }
        },

        onError: (err) => {
          console.error('[DEBUG] mutation onError:', err);
          // Show the error inside the dialog so the user knows what went wrong
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            (err as Error)?.message ??
            'Failed to create project. Check that the backend is running.';
          setSubmitError(message);
        },
      }
    );
  };

  const handleClose = () => {
    if (isPending) return; // don't allow close mid-request
    reset();
    setSelectedPlatforms([]);
    setPlatformError('');
    setSubmitError('');
    setOpen(false);
  };

  const isPending = createProjectWithSessions.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger render={<Button size="sm" className={compact ? "h-7 px-2.5 text-[12px] gap-1 bg-[#f1f5f9] text-[#0f172a] hover:bg-[#e2e8f0] border border-border rounded-lg cursor-pointer" : "h-9 px-4 text-[13px] gap-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl cursor-pointer"} />}>
        <Plus className="w-3.5 h-3.5" />
        {compact ? <span>New</span> : <span>Add Project</span>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-110 bg-card border-border">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Name your project and choose which AI platforms to open sessions for.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-2">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Project Name
            </label>
            <Input
              placeholder="e.g. RAG Research"
              {...register('name')}
              className="bg-muted/30 border-border focus:border-[#4f46e5] text-sm focus:ring-1 focus:ring-[#4f46e5]/30"
            />
            {errors.name && (
              <span className="text-xs text-rose-500">{errors.name.message}</span>
            )}
          </div>

          {/* Platform Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              AI Platforms
            </label>
            <p className="text-[11px] text-muted-foreground">
              The extension will open a tab for each selected platform.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {PLATFORMS.map(({ id, label, domain }) => {
                const selected = selectedPlatforms.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePlatform(id)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                      selected
                        ? 'border-[#4f46e5] bg-[#4f46e5]/8 text-[#4f46e5]'
                        : 'border-border/60 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] font-mono opacity-60">{domain}</span>
                  </button>
                );
              })}
            </div>
            {platformError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {platformError}
              </div>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border/40">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#0f172a] hover:bg-[#1e293b] text-white cursor-pointer"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
