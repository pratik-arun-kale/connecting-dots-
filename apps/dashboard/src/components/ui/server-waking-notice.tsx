'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useServerWaking } from '@/lib/api/cold-start';

/** Shown while a read or the sign-in refresh is slower than 3 s: most likely the API starting up. */
export function ServerWakingNotice() {
  const slow = useServerWaking((s) => s.slow);
  if (slow === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-foreground px-4 py-2.5 text-[13px] text-background shadow-lg"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1">Waking up the server… this can take up to a minute.</span>
      </div>
    </div>
  );
}
