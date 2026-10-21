import type { ApiContext } from '@/types';
import { getContextPlatform, getSourceChip } from '@/lib/context-platform';

export interface ContextMessage { role: string; content: string }

export function getMessages(context: ApiContext): ContextMessage[] {
  const raw = context.raw_content as Record<string, unknown>;
  return (raw?.messages as ContextMessage[] | undefined) ?? [];
}

/** One Markdown line as plain text: drops block markers (heading, bullet,
 *  numbering, quote, checkbox), link syntax and emphasis/code markers, but
 *  keeps hyphens and underscores inside words. */
export function stripMarkdownLine(line: string): string {
  return line
    .replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|\*|~~|`)(\S(?:.*?\S)?)\1/g, '$2')
    .trim();
}

/** The note's text as plain lines. Notes read content_md: that's where
 *  edits land — raw_content.messages is the immutable first-save snapshot
 *  (for a composer note, only the words typed before the first autosave). */
export function getBodyLines(context: ApiContext): string[] {
  const messages = getMessages(context);
  let text: string;
  if (getContextPlatform(context) === 'note') {
    text = context.content_md ?? messages[0]?.content ?? '';
  } else if (messages.length <= 1) {
    text = messages[0]?.content ?? '';
  } else {
    const firstUser = messages.find((m) => m.role === 'user');
    const firstOther = messages.find((m) => m.role !== 'user');
    text = [firstUser && `You asked: ${firstUser.content}`, firstOther?.content].filter(Boolean).join('\n');
  }
  return text.split('\n').map(stripMarkdownLine).filter(Boolean);
}

/** The title shown when the reader hasn't set one. Notes have no real
 *  automatic title ("[Note] <first 80 chars>" isn't meant for display), so
 *  their first line serves as one; captured conversations use the page
 *  title cleaned up at capture. */
export function getAutoTitle(context: ApiContext): string {
  if (getContextPlatform(context) !== 'note' && context.title) return context.title;
  return getBodyLines(context)[0] ?? 'Untitled';
}

export function getDisplayTitle(context: ApiContext): string {
  return context.user_title?.trim() || getAutoTitle(context);
}

/** Card preview, as one flowing line for CSS line-clamp (clamping rendered
 *  Markdown doesn't work). A note without its own title uses its first line
 *  as the title, so the preview starts after it. */
export function getPreviewText(context: ApiContext): string {
  const lines = getBodyLines(context);
  const firstLineIsTitle = getContextPlatform(context) === 'note' && !context.user_title?.trim();
  return (firstLineIsTitle ? lines.slice(1) : lines).join(' ');
}

/** Every whitespace-separated term must appear somewhere in the note. */
export function matchesQuery(context: ApiContext, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    getDisplayTitle(context),
    getSourceChip(context).label,
    context.page_title,
    context.prompt_text,
    context.content_md ?? getMessages(context).map((m) => m.content).join('\n'),
  ].filter(Boolean).join('\n').toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
