'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CodeBlock } from './code-block';
import './markdown-content.css';

/**
 * Renders captured Markdown (currently: extension notes, which capture the
 * selection's HTML and convert it to Markdown with Turndown at capture
 * time — see content-scripts/note-cs.js — instead of losing all formatting
 * to a bare selection.toString()). GFM tables/strikethrough and LaTeX math
 * ($inline$ / $$block$$) render via the remark/rehype pipeline below.
 *
 * Syntax highlighting is deliberately NOT done here via @shikijs/rehype —
 * that plugin's highlighting is asynchronous, but react-markdown always
 * runs its pipeline with processSync(); mixing the two throws "runSync
 * finished async. Use run instead" the first time a code block needs a
 * language Shiki hasn't already loaded. CodeBlock (the `pre` override)
 * highlights client-side instead, outside this pipeline entirely.
 */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ pre: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
