'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { authService } from '@/lib/api/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import { extractErrorMessage } from '@/lib/api/error-message';

const schema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitError, setSubmitError] = useState('');
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setSubmitError('');
    setIsPending(true);
    try {
      const tokens = await authService.register(data.email, data.password);
      setSession(tokens);
      router.push('/dashboard');
    } catch (err) {
      setSubmitError(extractErrorMessage(err, 'Something went wrong. Check that the backend is running.'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
      <Card className="w-full max-w-sm border-border bg-white p-8">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-[#0f172a]">Create your account</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Set up your Context Workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Email
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...register('email')}
              className="bg-muted/30 border-border focus:border-[#4f46e5] text-sm focus:ring-1 focus:ring-[#4f46e5]/30"
            />
            {errors.email && <span className="text-xs text-rose-500">{errors.email.message}</span>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Password
            </label>
            <Input
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              {...register('password')}
              className="bg-muted/30 border-border focus:border-[#4f46e5] text-sm focus:ring-1 focus:ring-[#4f46e5]/30"
            />
            {errors.password && <span className="text-xs text-rose-500">{errors.password.message}</span>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Confirm password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="bg-muted/30 border-border focus:border-[#4f46e5] text-sm focus:ring-1 focus:ring-[#4f46e5]/30"
            />
            {errors.confirmPassword && (
              <span className="text-xs text-rose-500">{errors.confirmPassword.message}</span>
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#0f172a] hover:bg-[#1e293b] text-white cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#4f46e5] hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
