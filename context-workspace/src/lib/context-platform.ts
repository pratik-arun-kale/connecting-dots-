import type { ApiContext } from '@/types';

/**
 * Resolves a context's platform the same way everywhere it's needed
 * (promoted column first, then metadata, then raw_content) — extracted out
 * of captured-context-list.tsx so page.tsx can filter notes out of
 * "Captured Context"/"Sessions" using the exact same rule the card display
 * uses, rather than a second, possibly-drifting copy of the fallback chain.
 */
export function getContextPlatform(context: ApiContext): string {
  const raw = context.raw_content as Record<string, unknown>;
  return (
    context.platform ??
    (context.metadata as Record<string, string> | null)?.platform ??
    (raw?.platform as string | undefined) ??
    'unknown'
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity',
};

const PLATFORM_HOST_PATTERNS: Record<string, string[]> = {
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  claude: ['claude.ai'],
  gemini: ['gemini.google.com'],
  perplexity: ['perplexity.ai'],
};

/**
 * Infers the AI platform a note was taken FROM, by its source URL. Notes
 * are stored with platform:"note" (so they group separately from full
 * conversation captures) but chat_url still points at the real
 * chatgpt.com/claude.ai/... page the selection came from.
 */
export function platformFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    for (const [platform, patterns] of Object.entries(PLATFORM_HOST_PATTERNS)) {
      if (patterns.some((p) => host === p || host.endsWith(`.${p}`))) return platform;
    }
  } catch {
    // Not a valid absolute URL (e.g. a dashboard-authored note with no source page) — no platform to infer.
  }
  return null;
}

/**
 * Where a note came from, for its label/color. "Mine" used to lump page
 * selections and typed notes together even though `kind` already told them
 * apart. Rows saved from the extension's manual-note launcher before the
 * 0008 migration were backfilled as kind="captured", so they show as
 * "Selected" — the stored data can't distinguish them.
 */
export type NoteOrigin = 'captured' | 'selected' | 'written';

export function getNoteOrigin(context: ApiContext): NoteOrigin {
  if (getContextPlatform(context) !== 'note') return 'captured';
  return context.kind === 'written' ? 'written' : 'selected';
}

export const NOTE_ORIGINS: Record<NoteOrigin, {
  label: string;
  description: string;
  chipClass: string;
  dotClass: string;
}> = {
  captured: {
    label: 'Captured',
    description: 'A whole AI conversation, saved with “Capture this conversation”.',
    chipClass: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-500',
    dotClass: 'bg-indigo-500',
  },
  selected: {
    label: 'Selected',
    description: 'A passage you highlighted on a page and saved.',
    chipClass: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-500',
    dotClass: 'bg-amber-500',
  },
  written: {
    label: 'Written',
    description: 'A note you typed yourself.',
    chipClass: 'border-rose-500/20 bg-rose-500/10 text-rose-500',
    dotClass: 'bg-rose-500',
  },
};

export interface SourceChip {
  label: string;
  href: string | null;
  isNote: boolean;
}

/**
 * A titled "<Platform> · <page title>" chip instead of a raw URL — the
 * extension now sends document.title as metadata.page_title at capture
 * time (see NOTE_SAVE_REQUEST / handleNoteSave in the extension's
 * background.ts).
 */
export function getSourceChip(context: ApiContext): SourceChip {
  const platform = getContextPlatform(context);
  const raw = context.raw_content as Record<string, unknown>;
  const chatUrl = context.chat_url ?? (raw?.chat_url as string | undefined) ?? null;
  const metadata = context.metadata as Record<string, unknown> | null;
  const pageTitle = metadata?.page_title as string | undefined;

  if (platform === 'note') {
    const sourcePlatform = platformFromUrl(chatUrl);
    const platformLabel = sourcePlatform ? PLATFORM_LABELS[sourcePlatform] : null;
    const label = [platformLabel, pageTitle].filter(Boolean).join(' · ') || 'Note';
    return { label, href: chatUrl, isNote: true };
  }

  const label = context.title || PLATFORM_LABELS[platform] || 'Captured Page';
  return { label, href: chatUrl, isNote: false };
}
