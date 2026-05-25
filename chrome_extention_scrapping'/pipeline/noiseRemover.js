import { preserveCodeBlocks, collapseBlankLines, deduplicateAdjacentLines, splitLines } from './utils.js';

const NOISE_PATTERNS = [
  /skip to content/i,
  /upgrade( now)?/i,
  /search chats?/i,
  /keyboard shortcuts?/i,
  /sign in/i,
  /log in/i,
  /log out/i,
  /profile/i,
  /account/i,
  /settings/i,
  /^(chatgpt|claude)$/i,
  /\b(home|updates|settings)\b/i,
  /recent(s)?/i,
  /pinned/i,
  /sidebar/i,
  /navigation/i,
  /menu(s)?/i,
  /footer/i,
  /help(center)?/i,
  /new chat/i,
  /continue/i,
  /show more/i,
  /learn more/i,
  /try again/i,
  /powered by/i,
  /terms of service/i,
  /privacy policy/i,
  /feedback/i,
  /cookie(s)?/i,
  /©/,
];

const NOISE_LINE_THRESHOLDS = [
  /^\s*[-—–]{2,}\s*$/, // horizontal separators
  /^\s*\.\.\.\s*$/, // ellipsis-only lines
  /^\s*\|\s*$/, // empty pipe separators
];

const DUPLICATE_WINDOW = 2;

/**
 * Remove UI noise and repeated junk from raw capture text.
 * Preserves code blocks exactly and collapses only excessive whitespace.
 * @param {string} rawText
 * @returns {string}
 */
export function removeNoise(rawText) {
  const safeText = String(rawText);

  return preserveCodeBlocks(safeText, (segment, isCode) => {
    if (isCode) return segment;

    const lines = splitLines(segment);
    const cleanedLines = lines
      .map(line => line.trimRight())
      .filter(line => !isNoiseLine(line))
      .filter((line, index, array) => !isRepeatedLine(line, index, array))
      .map(line => collapseInlineWhitespace(line));

    return collapseBlankLines(cleanedLines.join('\n'))
      .replace(/\n{3,}/g, '\n\n');
  });
}

function isNoiseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (NOISE_LINE_THRESHOLDS.some(pattern => pattern.test(trimmed))) return true;
  return NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
}

function isRepeatedLine(line, index, array) {
  if (!line.trim()) return false;
  for (let offset = 1; offset <= DUPLICATE_WINDOW; offset += 1) {
    if (array[index - offset] && array[index - offset] === line) {
      return true;
    }
  }
  return false;
}

function collapseInlineWhitespace(line) {
  // Keep indentation inside code blocks intact elsewhere by only collapsing
  // repeated spaces outside the preserved code segments.
  return line.replace(/\s{3,}/g, '  ');
}
