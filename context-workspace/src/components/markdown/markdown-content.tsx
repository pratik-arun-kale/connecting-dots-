'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeShiki from '@shikijs/rehype';
import 'katex/dist/katex.min.css';
import { CodeBlock } from './code-block';
import './markdown-content.css';

const rehypePlugins: React.ComponentProps<typeof ReactMarkdown>['rehypePlugins'] = [
  [rehypeShiki, { theme: 'github-light' }],
  rehypeKatex,
];

/**
 * Renders captured Markdown (currently: extension notes, which capture the
 * selection's HTML and convert it to Markdown with Turndown at capture
 * time — see content-scripts/note-cs.js — instead of losing all formatting
 * to a bare selection.toString()). GFM tables/strikethrough, LaTeX math
 * ($inline$ / $$block$$), and syntax-highlighted fenced code blocks with a
 * copy button all work out of the box against that Markdown.
 */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        components={{ pre: CodeBlock }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
