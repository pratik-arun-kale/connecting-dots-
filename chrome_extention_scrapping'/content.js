/**
 * content.js — PageCapture Content Script
 * ========================================
 * Injected into the active tab on demand (via scripting.executeScript).
 * Responsible for:
 *   1. Traversing the full visible DOM
 *   2. Extracting text with formatting fidelity
 *   3. Producing a structured markdown-like string
 *   4. Returning the result to the caller via a return value
 *
 * Design principle: Never summarise, never compress, never lose whitespace
 * inside code/pre blocks. Every heading, list, table, and paragraph is
 * preserved as faithfully as possible.
 */

(() => {

  // ─────────────────────────────────────────────────────────
  // SECTION 1 — CONSTANTS & CONFIG
  // ─────────────────────────────────────────────────────────

  /** Tags whose entire subtree should be silently skipped. */
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME',
    'OBJECT', 'EMBED', 'SVG', 'CANVAS',
    'HEAD', 'TEMPLATE', 'AUDIO', 'VIDEO',
  ]);

  /** Tags that introduce a blank line before and after themselves. */
  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE',
    'HEADER', 'FOOTER', 'NAV', 'FORM', 'BLOCKQUOTE',
    'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY',
    'DL', 'DD', 'DT',
  ]);

  /** Heading levels mapped to markdown-style prefix. */
  const HEADING_MAP = { H1: '#', H2: '##', H3: '###', H4: '####', H5: '#####', H6: '######' };

  /** Tags that emit a single line-break after themselves (inline block). */
  const BREAK_AFTER_TAGS = new Set(['BR', 'HR']);

  // ─────────────────────────────────────────────────────────
  // SECTION 2 — UTILITY HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Determine whether a DOM node is visible to the user.
   * Skips hidden elements so we don't capture display:none content.
   * @param {Element} el
   * @returns {boolean}
   */
  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return true; // text nodes etc.
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  /**
   * Collapse runs of more than two consecutive blank lines into exactly two.
   * This keeps sections separated without wasteful blank space.
   * @param {string} text
   * @returns {string}
   */
  function collapseExcessiveBlankLines(text) {
    return text.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Deduplicate consecutive identical lines (catches repeated nav items etc.).
   * Only removes exact duplicates that appear back-to-back.
   * @param {string} text
   * @returns {string}
   */
  function deduplicateConsecutiveLines(text) {
    const lines = text.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 || lines[i] !== lines[i - 1]) {
        result.push(lines[i]);
      }
    }
    return result.join('\n');
  }

  /**
   * Extract the raw preserved text from a <pre> or <code> block.
   * Uses innerText to respect whitespace exactly as rendered.
   * @param {HTMLElement} el
   * @returns {string}
   */
  function extractPreformattedBlock(el) {
    // innerText respects CSS white-space rendering
    const raw = el.innerText ?? el.textContent ?? '';
    // Detect language hint from class (e.g. class="language-python")
    const langClass = [...(el.classList || [])].find(c => c.startsWith('language-'));
    const lang = langClass ? langClass.replace('language-', '') : '';
    const fence = '```' + lang;
    return `\n${fence}\n${raw}\n\`\`\`\n`;
  }

  /**
   * Extract a table element into a plain-text grid.
   * Columns are separated by ' | ' and header rows get a separator row.
   * @param {HTMLTableElement} table
   * @returns {string}
   */
  function extractTable(table) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length === 0) return '';

    const grid = rows.map(row =>
      [...row.querySelectorAll('th, td')].map(cell => cell.innerText.trim().replace(/\n+/g, ' '))
    );

    // Calculate max column count
    const colCount = Math.max(...grid.map(r => r.length));

    // Pad rows to equal width
    const padded = grid.map(row => {
      while (row.length < colCount) row.push('');
      return row;
    });

    // Calculate column widths for alignment
    const colWidths = Array.from({ length: colCount }, (_, ci) =>
      Math.max(...padded.map(r => (r[ci] || '').length), 3)
    );

    const formatRow = row =>
      '| ' + row.map((cell, ci) => cell.padEnd(colWidths[ci])).join(' | ') + ' |';

    const separator =
      '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';

    const lines = [];
    padded.forEach((row, i) => {
      lines.push(formatRow(row));
      // Insert separator after first row if table has <thead>
      if (i === 0 && table.querySelector('thead')) {
        lines.push(separator);
      }
    });

    return '\n' + lines.join('\n') + '\n';
  }

  /**
   * Detect whether an element is a markdown-style code block
   * (common in docs sites, GitHub, Stack Overflow, etc.)
   * @param {Element} el
   * @returns {boolean}
   */
  function isCodeLike(el) {
    const tag = el.tagName;
    if (tag === 'PRE' || tag === 'CODE') return true;
    const cls = (el.className || '').toLowerCase();
    return cls.includes('code') || cls.includes('highlight') || cls.includes('prism');
  }

  // ─────────────────────────────────────────────────────────
  // SECTION 3 — CORE DOM TRAVERSAL ENGINE
  // ─────────────────────────────────────────────────────────

  /**
   * Recursively walk the DOM and build an array of string "chunks".
   * Each chunk is a fragment of text that will later be joined.
   *
   * @param {Node} node — current DOM node
   * @param {Object} ctx — mutable traversal context
   * @param {boolean} ctx.insidePre — true when inside a <pre> block
   * @param {number} ctx.listDepth — current nesting depth for lists
   * @param {string} ctx.listType — 'ul' or 'ol'
   * @param {number[]} ctx.olCounters — stack of ordered-list counters
   * @returns {string[]} flat array of text chunks
   */
  function walkNode(node, ctx = { insidePre: false, listDepth: 0, listType: '', olCounters: [] }) {
    const chunks = [];

    // ── Text node ──────────────────────────────────────────
    if (node.nodeType === Node.TEXT_NODE) {
      const text = ctx.insidePre
        ? node.textContent                  // preserve raw whitespace in pre
        : node.textContent.replace(/\s+/g, ' '); // normalise inline whitespace
      if (text) chunks.push(text);
      return chunks;
    }

    // ── Element node ──────────────────────────────────────
    if (node.nodeType !== Node.ELEMENT_NODE) return chunks;

    const el = /** @type {HTMLElement} */ (node);
    const tag = el.tagName;

    // Skip invisible elements and junk tags
    if (SKIP_TAGS.has(tag)) return chunks;
    if (!isVisible(el)) return chunks;

    // ── <br> / <hr> ───────────────────────────────────────
    if (tag === 'BR') { chunks.push('\n'); return chunks; }
    if (tag === 'HR') { chunks.push('\n---\n'); return chunks; }

    // ── Headings ──────────────────────────────────────────
    if (HEADING_MAP[tag]) {
      const prefix = HEADING_MAP[tag];
      const text = el.innerText.trim();
      if (text) chunks.push(`\n\n${prefix} ${text}\n\n`);
      return chunks; // headings are self-contained; skip child traversal
    }

    // ── <pre> blocks — exact whitespace preservation ───────
    if (tag === 'PRE') {
      chunks.push(extractPreformattedBlock(el));
      return chunks; // do not walk children; already captured
    }

    // ── Inline <code> (not inside <pre>) ──────────────────
    if (tag === 'CODE' && !ctx.insidePre) {
      const codeText = el.innerText ?? el.textContent ?? '';
      // Only wrap in backticks if single-line (multi-line → block)
      if (!codeText.includes('\n')) {
        chunks.push('`' + codeText + '`');
      } else {
        chunks.push(extractPreformattedBlock(el));
      }
      return chunks;
    }

    // ── Tables ────────────────────────────────────────────
    if (tag === 'TABLE') {
      chunks.push(extractTable(/** @type {HTMLTableElement} */ (el)));
      return chunks;
    }

    // ── Lists ─────────────────────────────────────────────
    if (tag === 'UL' || tag === 'OL') {
      const newCtx = {
        ...ctx,
        listDepth: ctx.listDepth + 1,
        listType: tag.toLowerCase(),
        olCounters: tag === 'OL'
          ? [...ctx.olCounters, 0]
          : ctx.olCounters,
      };
      chunks.push('\n');
      for (const child of el.childNodes) {
        chunks.push(...walkNode(child, newCtx));
      }
      chunks.push('\n');
      return chunks;
    }

    if (tag === 'LI') {
      const indent = '  '.repeat(Math.max(0, ctx.listDepth - 1));
      let bullet;
      if (ctx.listType === 'ol') {
        // Increment the counter for the current ol depth
        ctx.olCounters[ctx.olCounters.length - 1]++;
        bullet = `${ctx.olCounters[ctx.olCounters.length - 1]}.`;
      } else {
        bullet = '-';
      }

      // Gather child content first
      const innerChunks = [];
      for (const child of el.childNodes) {
        innerChunks.push(...walkNode(child, { ...ctx, listDepth: ctx.listDepth }));
      }
      const innerText = innerChunks.join('').trim();
      chunks.push(`\n${indent}${bullet} ${innerText}`);
      return chunks;
    }

    // ── Blockquote ────────────────────────────────────────
    if (tag === 'BLOCKQUOTE') {
      const innerChunks = [];
      for (const child of el.childNodes) {
        innerChunks.push(...walkNode(child, ctx));
      }
      const inner = innerChunks.join('').trim();
      const quoted = inner.split('\n').map(line => `> ${line}`).join('\n');
      chunks.push(`\n\n${quoted}\n\n`);
      return chunks;
    }

    // ── Bold / Italic inline markers ──────────────────────
    if (tag === 'STRONG' || tag === 'B') {
      const innerChunks = [];
      for (const child of el.childNodes) innerChunks.push(...walkNode(child, ctx));
      const inner = innerChunks.join('').trim();
      if (inner) chunks.push(`**${inner}**`);
      return chunks;
    }
    if (tag === 'EM' || tag === 'I') {
      const innerChunks = [];
      for (const child of el.childNodes) innerChunks.push(...walkNode(child, ctx));
      const inner = innerChunks.join('').trim();
      if (inner) chunks.push(`_${inner}_`);
      return chunks;
    }

    // ── Links ─────────────────────────────────────────────
    if (tag === 'A') {
      const href = el.getAttribute('href') || '';
      const innerChunks = [];
      for (const child of el.childNodes) innerChunks.push(...walkNode(child, ctx));
      const linkText = innerChunks.join('').trim();
      if (linkText && href && !href.startsWith('javascript:')) {
        const absHref = href.startsWith('http') ? href : new URL(href, location.href).href;
        chunks.push(`[${linkText}](${absHref})`);
      } else if (linkText) {
        chunks.push(linkText);
      }
      return chunks;
    }

    // ── Image alt text ────────────────────────────────────
    if (tag === 'IMG') {
      const alt = el.getAttribute('alt');
      if (alt && alt.trim()) chunks.push(`[Image: ${alt.trim()}]`);
      return chunks;
    }

    // ── Generic block-level element ───────────────────────
    const isBlock = BLOCK_TAGS.has(tag) || window.getComputedStyle(el).display === 'block';
    if (isBlock) {
      chunks.push('\n\n');
    }

    // ── Recurse into children ─────────────────────────────
    const childCtx = tag === 'PRE' ? { ...ctx, insidePre: true } : ctx;
    for (const child of el.childNodes) {
      chunks.push(...walkNode(child, childCtx));
    }

    if (isBlock) {
      chunks.push('\n\n');
    }

    return chunks;
  }

  // ─────────────────────────────────────────────────────────
  // SECTION 4 — PAGE EXTRACTION ORCHESTRATOR
  // ─────────────────────────────────────────────────────────

  /**
   * Main extraction entry point.
   * Walks the document body, assembles raw chunks, then post-processes
   * the result for cleanliness without sacrificing formatting fidelity.
   *
   * @returns {{ title: string, url: string, timestamp: string, content: string }}
   */
  function extractPage() {
    const body = document.body;
    if (!body) {
      return {
        title: document.title || '(no title)',
        url: location.href,
        timestamp: new Date().toISOString(),
        content: '(empty page)',
      };
    }

    // Walk the full DOM tree
    const rawChunks = walkNode(body);
    let content = rawChunks.join('');

    // ── Post-processing pipeline ───────────────────────────

    // 1. Collapse runs of spaces ONLY outside code fences
    //    Strategy: split on code fences, process non-code segments only
    content = processOutsideCodeFences(content, segment =>
      segment.replace(/[ \t]+\n/g, '\n')           // trailing spaces on lines
              .replace(/\n +\n/g, '\n\n')           // lines with only spaces → blank
    );

    // 2. Collapse more than 2 consecutive blank lines
    content = collapseExcessiveBlankLines(content);

    // 3. Deduplicate consecutive identical lines (nav repetition etc.)
    content = deduplicateConsecutiveLines(content);

    // 4. Trim leading/trailing whitespace from the whole document
    content = content.trim();

    return {
      title: document.title || '(no title)',
      url: location.href,
      timestamp: new Date().toISOString(),
      content,
    };
  }

  /**
   * Process text OUTSIDE markdown code fences (``` blocks) with a transform fn.
   * Code fence content is passed through unchanged.
   *
   * @param {string} text
   * @param {(segment: string) => string} transformFn
   * @returns {string}
   */
  function processOutsideCodeFences(text, transformFn) {
    // Split on triple-backtick fences
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) =>
      i % 2 === 0
        ? transformFn(part)   // non-code segment → apply transform
        : part                // code fence → preserve exactly
    ).join('');
  }

  // ─────────────────────────────────────────────────────────
  // SECTION 5 — EXECUTE & RETURN
  // ─────────────────────────────────────────────────────────

  // executeScript returns the value of the last expression in the script.
  // We return the structured payload directly.
  return extractPage();

})();
