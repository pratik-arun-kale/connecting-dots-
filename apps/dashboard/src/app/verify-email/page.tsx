'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthNotice, AuthShell, authLinkClass } from '@/components/auth/auth-shell';
import { authService } from '@/lib/api/services/auth.service';
import { extractErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth-store';

// useSearchParams() must sit under a Suspense boundary in the App Router.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}

type State = { kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string };

function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const [state, setState] = useState<State>(
    token ? { kind: 'working' } : { kind: 'failed', message: 'This link is missing its token.' },
  );
  // A token works once; React's development double-run of effects must not
  // spend it on a request whose answer is thrown away.
  const sent = useRef(false);

  useEffect(() => {
    // Wait for AuthProvider's silent refresh to settle first. Its answer
    // carries the user as they were before this link was opened; landing
    // after ours, it would put the "Confirm your email" banner back.
    if (!token || sent.current || status === 'idle') return;
    sent.current = true;
    authService
      .verifyEmail(token)
      .then((user) => {
        setUser(user);
        setState({ kind: 'done' });
      })
      .catch((err) =>
        setState({ kind: 'failed', message: extractErrorMessage(err, 'Could not confirm your email. Try again.') }),
      );
  }, [token, status, setUser]);

  const next = status === 'authenticated' ? { href: '/notes', label: 'Go to your notes' } : { href: '/login', label: 'Sign in' };

  return (
    <AuthShell title="Confirm your email">
      {state.kind === 'working' && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
        </p>
      )}
      {state.kind === 'done' && <AuthNotice tone="success">Your email is confirmed.</AuthNotice>}
      {state.kind === 'failed' && (
        <AuthNotice tone="error">
          {state.message}
          {status === 'authenticated' && ' You can send a new link from the banner in your workspace.'}
        </AuthNotice>
      )}
      {state.kind !== 'working' && (
        <p className="mt-6 text-center text-[13px]">
          <Link href={next.href} className={authLinkClass}>
            {next.label}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
