import { splitLines, collapseBlankLines } from '../utils.js';

const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;

function extractUrls(text) {
  const matches = text.match(URL_PATTERN);
  return matches ? Array.from(new Set(matches)) : [];
}

function createParagraphBlock(lines) {
  return {
    type: 'paragraph',
    text: collapseBlankLines(lines.join(' ').trim()),
  };
}

function createListBlock(lines) {
  return {
    type: 'list',
    items: lines.map(line => line.replace(/^\s*([-*+]\s+|\d+\.\s+)/, '').trim()),
  };
}

function createHeading(line) {
  const trimmed = line.trim();
  const markdownLevel = (trimmed.match(/^#+/) || [''])[0].length;
  const title = trimmed.replace(/^#+\s*/, '').trim();
  return {
    type: 'heading',
    level: markdownLevel || inferHeadingLevel(title),
    title,
  };
}

function inferHeadingLevel(text) {
  if (!text) return 3;
  if (text.length < 40 && /\b(summary|overview|notes|discussion|analysis)\b/i.test(text)) {
    return 2;
  }
  return 3;
}

function createQuoteBlock(lines) {
  return {
    type: 'quote',
    text: collapseBlankLines(lines.map(line => line.replace(/^>\s?/, '')).join(' ').trim()),
  };
}

/**
 * Parse a generic cleaned webpage into structured sections.
 * @param {string} cleanText
 * @returns {{ type: string, content: { sections: Array } }}
 */
export function parseGenericPage(cleanText) {
  const rawLines = splitLines(cleanText);
  const sections = [];
  let currentSection = null;
  let buffer = [];

  function flushBuffer() {
    if (!buffer.length) return;
    const first = buffer[0].trim();
    if (first.startsWith('#')) {
      if (currentSection) sections.push(currentSection);
      currentSection = { ...createHeading(first), items: [] };
    } else if (buffer.every(line => /^\s*([-*+]\s+|\d+\.\s+)/.test(line))) {
      const listBlock = createListBlock(buffer);
      if (!currentSection) currentSection = { type: 'section', title: '', items: [] };
      currentSection.items.push(listBlock);
    } else if (buffer.every(line => /^>\s?/.test(line))) {
      const quoteBlock = createQuoteBlock(buffer);
      if (!currentSection) currentSection = { type: 'section', title: '', items: [] };
      currentSection.items.push(quoteBlock);
    } else {
      const paragraph = createParagraphBlock(buffer);
      if (!currentSection) currentSection = { type: 'section', title: '', items: [] };
      const urls = extractUrls(paragraph.text);
      if (urls.length) paragraph.urls = urls;
      currentSection.items.push(paragraph);
    }

    buffer = [];
  }

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBuffer();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed) && buffer.length === 0) {
      flushBuffer();
      currentSection = { ...createHeading(trimmed), items: [] };
      continue;
    }

    if (!currentSection) {
      currentSection = { type: 'section', title: '', items: [] };
    }

    buffer.push(line);
  }

  flushBuffer();
  if (currentSection && currentSection.items && currentSection.items.length) {
    sections.push(currentSection);
  }

  return {
    type: 'document',
    content: {
      sections,
    },
  };
}
