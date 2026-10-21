'use client';

import { isValidElement, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { getSingletonHighlighter } from 'shiki';

// Always dark, regardless of the app's light/dark/sepia theme — a code
// block with its own dark "terminal" background reads fine embedded in a
// light page (GitHub, most doc sites do this) and sidesteps re-highlighting
// every block on every theme change.
const THEME = 'github-dark';

function extractCodeInfo(children: ReactNode): { code: string; lang: string | null } {
  // react-markdown passes a single <code className="language-xxx"> element
  // as this <pre>'s child for a fenced block; className is absent when no
  // language was specified in the fence.
  if (isValidElement(children)) {
    const props = children.props as { className?: string; children?: ReactNode };
    const match = /language-(\S+)/.exec(props.className ?? '');
    const raw = props.children;
    const code = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('') : '';
    return { code: code.replace(/\n$/, ''), lang: match?.[1] ?? null };
  }
  return { code: '', lang: null };
}

/**
 * Overrides the <pre> react-markdown renders for fenced code blocks.
 *
 * Deliberately does NOT use @shikijs/rehype: that plugin highlights inside
 * the unified/rehype pipeline, which is asynchronous (loading Shiki's WASM
 * grammar engine + themes/languages can't be synchronous), but
 * react-markdown runs that pipeline with processSync() — the combination
 * throws "runSync finished async. Use run instead" the moment a code block
 * needs a language that wasn't already loaded. Highlighting here instead,
 * in a plain useEffect outside the markdown pipeline, sidesteps that
 * mismatch entirely: render the plain code first, swap in the
 * Shiki-highlighted HTML once the (shared, singleton) highlighter resolves.
 */
export function CodeBlock(props: ComponentPropsWithoutRef<'pre'>) {
  const { code, lang } = extractCodeInfo(props.children);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!code || !lang) return;
    let cancelled = false;

    getSingletonHighlighter({ themes: [THEME], langs: [] })
      .then(async (highlighter) => {
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          try {
            await highlighter.loadLanguage(lang as never);
          } catch {
            return; // unknown/unsupported language — leave the plain <pre> in place
          }
        }
        if (cancelled) return;
        setHtml(highlighter.codeToHtml(code, { lang, theme: THEME }));
      })
      .catch(() => {
        // Highlighter failed to initialize (e.g. offline first load) — plain <pre> stays.
      });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = async () => {
    const text = code || preRef.current?.textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable or permission denied — button just won't confirm.
    }
  };

  return (
    <div className="group/code relative">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
        className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-border/60 bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/code:opacity-100"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      {html ? (
        // Shiki's own output — static, tokenized HTML it generates from the
        // code string, not user-supplied markup being trusted verbatim.
        <div className="shiki-wrapper" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre ref={preRef} {...props} />
      )}
    </div>
  );
}
