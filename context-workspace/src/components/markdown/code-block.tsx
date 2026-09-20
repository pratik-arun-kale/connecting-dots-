'use client';

import { useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Overrides the <pre> react-markdown renders for fenced code blocks.
 * By the time this receives props, @shikijs/rehype has already turned the
 * code into syntax-highlighted spans (in the rehype/HAST pipeline, before
 * react-markdown's component overrides run) — this just wraps that output
 * with a copy button, it doesn't touch the highlighting itself.
 */
export function CodeBlock(props: ComponentPropsWithoutRef<'pre'>) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
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
      <pre ref={preRef} {...props} />
    </div>
  );
}
