import React from 'react';
import Link from 'next/link';
import { env } from '@/lib/env';

/** Long-form public page (privacy, terms, feedback): readable width, no login needed. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4">
          <Link href="/notes" className="text-[15px] font-semibold">Connecting Dots</Link>
          <nav className="flex gap-4 text-[13px] text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/feedback" className="hover:text-foreground">Feedback</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-note text-[2rem] font-medium tracking-tight">{title}</h1>
        {updated && <p className="mt-1 text-[13px] text-muted-foreground">Last updated {updated}</p>}
        <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
    </div>
  );
}

/** The contact address as a link, or a plain notice when it isn't configured. */
export function ContactEmail() {
  if (!env.contactEmail) return <strong>(no contact address is configured yet)</strong>;
  return <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>;
}
