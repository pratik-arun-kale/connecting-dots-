'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AuthNotice,
  AuthShell,
  authButtonClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
} from '@/components/auth/auth-shell';
import { authService } from '@/lib/api/services/auth.service';
import { extractErrorMessage } from '@/lib/api/error-message';
import { useAuthStore } from '@/store/auth-store';

const schema = z
  .object({
    password: z.string().min(10, 'Password must be at least 10 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ['confirm'] });

type FormValues = z.infer<typeof schema>;

// useSearchParams() must sit under a Suspense boundary in the App Router.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const token = useSearchParams().get('token') ?? '';
  const clearSession = useAuthStore((s) => s.clearSession);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }: FormValues) => {
    setSubmitError('');
    setIsPending(true);
    try {
      await authService.resetPassword(token, password);
      // The API signed out every session, this browser's included.
      clearSession();
      setDone(true);
    } catch (err) {
      setSubmitError(extractErrorMessage(err, 'Could not reset your password. Try again.'));
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Choose a new password">
        <AuthNotice tone="error">This link is missing its token. Ask for a new one.</AuthNotice>
        <p className="mt-6 text-center text-[13px]">
          <Link href="/forgot-password" className={authLinkClass}>
            Send a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="This signs you out on every device.">
      {done ? (
        <>
          <AuthNotice tone="success">Your password is changed. Sign in with the new one.</AuthNotice>
          <p className="mt-6 text-center text-[13px]">
            <Link href="/login" className={authLinkClass}>
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className={authLabelClass}>
              New password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="At least 10 characters"
              autoComplete="new-password"
              {...register('password')}
              className={authInputClass}
            />
            {errors.password && <span className="text-xs text-rose-500">{errors.password.message}</span>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm" className={authLabelClass}>
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirm')}
              className={authInputClass}
            />
            {errors.confirm && <span className="text-xs text-rose-500">{errors.confirm.message}</span>}
          </div>
          {submitError && (
            <AuthNotice tone="error">
              {submitError}{' '}
              <Link href="/forgot-password" className={authLinkClass}>
                Send a new link
              </Link>
            </AuthNotice>
          )}
          <Button type="submit" disabled={isPending} className={authButtonClass}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set new password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
