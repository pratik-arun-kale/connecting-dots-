'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Terminal } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  fileName?: string;
}

export function CodeBlock({ code, language, fileName }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 border border-border/80 rounded-xl overflow-hidden bg-zinc-950 font-mono text-[12px] shadow-lg max-w-full">
      {/* Codeblock Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-zinc-900 text-zinc-400 select-none">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span>{fileName || 'code-snippet'}</span>
          {language && (
            <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.2 rounded uppercase">
              {language}
            </span>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer shrink-0"
          title="Copy code to clipboard"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 animate-in fade-in" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Code Text Content */}
      <div className="overflow-x-auto p-4 max-h-[350px]">
        <pre className="text-zinc-200 selection:bg-indigo-500/30 whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
