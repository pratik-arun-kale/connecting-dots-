'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }: FormValues) => {
    setSubmitError('');
    setIsPending(true);
    try {
      await authService.requestPasswordReset(email);
      setSentTo(email);
    } catch (err) {
      setSubmitError(extractErrorMessage(err, 'Something went wrong. Try again.'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sentTo ? (
        // The API answers the same for every address, so this can't say
        // whether an account exists — and shouldn't.
        <AuthNotice tone="success">
          If {sentTo} has an account, a reset link is on its way. It works once and expires in an hour.
        </AuthNotice>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className={authLabelClass}>
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...register('email')}
              className={authInputClass}
            />
            {errors.email && <span className="text-xs text-rose-500">{errors.email.message}</span>}
          </div>
          {submitError && <AuthNotice tone="error">{submitError}</AuthNotice>}
          <Button type="submit" disabled={isPending} className={authButtonClass}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        <Link href="/login" className={authLinkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
