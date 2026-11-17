'use client';

import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { authService } from '@/lib/api/services/auth.service';
import { extractErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth-store';

/** Asks a signed-in user with an unconfirmed address to confirm it. Never blocks anything. */
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');

  if (!user || user.email_verified_at) return null;

  const resend = async () => {
    setState('sending');
    try {
      await authService.requestVerification();
      setState('sent');
    } catch (err) {
      setState({ error: extractErrorMessage(err, 'Could not send the email. Try again later.') });
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[13px] text-amber-900 dark:text-amber-200"
    >
      <MailCheck className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Confirm your email: we sent a link to <span className="font-medium">{user.email}</span>.
      </span>
      {state === 'sent' ? (
        <span>New link sent.</span>
      ) : typeof state === 'object' ? (
        <span>{state.error}</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending'}
          className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60 cursor-pointer"
        >
          {state === 'sending' ? 'Sending…' : 'Send a new link'}
        </button>
      )}
    </div>
  );
}
