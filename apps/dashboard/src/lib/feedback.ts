import { env } from '@/lib/env';

/** Where a feedback email was started from; it goes in the subject and body. */
export type FeedbackSource = 'sidebar' | 'ask-ai-helpful' | 'ask-ai-not-helpful' | 'extension' | 'page';

const QUESTIONS = [
  'How easy was it to set up? (1–5)',
  'What did you try to do?',
  'What broke or confused you?',
  'Would you keep using it, and why?',
  'Anything you would pay for?',
];

/**
 * A mailto: link to the contact address with the five beta questions, the
 * dashboard's version and where it was opened from already filled in; null
 * when no contact address is configured. `version` overrides the dashboard's
 * own (the extension passes its manifest version).
 */
export function feedbackMailto(from: FeedbackSource, version: string = env.version): string | null {
  if (!env.contactEmail) return null;
  const subject = `Connecting Dots feedback (${from})`;
  const body = [
    ...QUESTIONS.flatMap((q) => [q, '', '']),
    '—',
    `Version: ${version}`,
    `From: ${from}`,
  ].join('\n');
  return `mailto:${env.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
