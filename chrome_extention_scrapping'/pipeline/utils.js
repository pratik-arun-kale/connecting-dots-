/**
 * Split text into lines while preserving blank lines.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * Collapse runs of more than two blank lines into exactly two.
 * @param {string} text
 * @returns {string}
 */
export function collapseBlankLines(text) {
  return text.replace(/(\n\s*){3,}/g, '\n\n');
}

/**
 * Deduplicate adjacent identical lines.
 * @param {string[]} lines
 * @returns {string[]}
 */
export function deduplicateAdjacentLines(lines) {
  return lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
}

/**
 * Preserve code and fenced blocks while allowing text normalization outside them.
 * @param {string} text
 * @param {(segment: string, isCode: boolean) => string} transform
 * @returns {string}
 */
export function preserveCodeBlocks(text, transform) {
  const fencePattern = /(^```[\s\S]*?^```$)/gm;
  let lastIndex = 0;
  const result = [];
  let match;

  while ((match = fencePattern.exec(text)) !== null) {
    result.push(transform(text.slice(lastIndex, match.index), false));
    result.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  result.push(transform(text.slice(lastIndex), false));
  return result.join('');
}

/**
 * Build a semantic chunk list for embeddings.
 * This is a lightweight helper to prepare text in smaller pieces.
 * @param {string} text
 * @param {number} maxChars
 * @returns {Array<{ text: string, metadata: Object }>}
 */
export function buildEmbeddingChunks(text, maxChars = 1200) {
  const paragraphs = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > maxChars) {
      if (current) chunks.push({ text: current.trim(), metadata: {} });
      current = paragraph + '\n\n';
    } else {
      current += paragraph + '\n\n';
    }
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), metadata: {} });
  }

  return chunks;
}

/**
 * Normalize heading structure so sections preserve their hierarchy.
 * @param {Array<Object>} sections
 * @returns {Array<Object>}
 */
export function normalizeHeadingTree(sections) {
  return sections.map(section => {
    if (!section || typeof section !== 'object') return section;
    return {
      ...section,
      items: Array.isArray(section.items) ? normalizeHeadingTree(section.items) : section.items,
    };
  });
}
