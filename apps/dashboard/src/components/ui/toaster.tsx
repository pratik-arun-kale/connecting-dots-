'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/store/toast-store';

/** Bottom-centre stack of toasts (see store/toast-store.ts). */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px] shadow-lg',
            t.tone === 'error'
              ? 'border-destructive/40 bg-destructive text-white'
              : 'border-border bg-foreground text-background',
          )}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                void t.action?.onClick();
              }}
              className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline cursor-pointer"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
