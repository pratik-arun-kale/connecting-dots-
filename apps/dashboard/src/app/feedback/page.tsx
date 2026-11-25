'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ContactEmail, LegalPage } from '@/components/legal/legal-page';
import { feedbackMailto, type FeedbackSource } from '@/lib/feedback';

const SOURCES: FeedbackSource[] = ['sidebar', 'ask-ai-helpful', 'ask-ai-not-helpful', 'extension', 'page'];

// useSearchParams() must sit under a Suspense boundary in the App Router.
export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <Feedback />
    </Suspense>
  );
}

/** /feedback?from=extension&version=3.0.0: the extension and plain links land here. */
function Feedback() {
  const params = useSearchParams();
  const from = params.get('from');
  const source: FeedbackSource = SOURCES.includes(from as FeedbackSource) ? (from as FeedbackSource) : 'page';
  const version = params.get('version')?.replace(/[^\w.-]/g, '').slice(0, 20) || undefined;
  const href = feedbackMailto(source, version);

  return (
    <LegalPage title="Send feedback">
      <p>
        Thanks for trying the beta. What worked, what broke, what confused you: all of it helps. The email opens with five
        short questions; answer any you like.
      </p>
      {href ? (
        <p>
          <a
            href={href}
            className="inline-flex h-9 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background no-underline hover:opacity-90"
          >
            Write feedback
          </a>
        </p>
      ) : null}
      <p className="text-[13px] text-muted-foreground">
        Or write to <ContactEmail /> from any email app.
      </p>
    </LegalPage>
  );
}
