import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { feedbackMailto, type FeedbackSource } from '@/lib/feedback';

/** "Send feedback": an email with the questions prefilled, or the feedback page when no address is set. */
export function FeedbackLink({
  from,
  children,
  ...rest
}: { from: FeedbackSource; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const mailto = feedbackMailto(from);
  if (mailto) return <a href={mailto} {...rest}>{children}</a>;
  return <Link href={`/feedback?from=${from}`} {...rest}>{children}</Link>;
}

/** Privacy · Terms, for the sign-in pages. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <p className={cn('text-center text-[12px] text-muted-foreground', className)}>
      <Link href="/privacy" className="hover:underline">Privacy</Link>
      {' · '}
      <Link href="/terms" className="hover:underline">Terms</Link>
    </p>
  );
}
