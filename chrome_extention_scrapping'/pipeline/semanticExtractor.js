import { parseChatGPT } from './parsers/chatgptParser.js';
import { parseClaude } from './parsers/claudeParser.js';
import { parseGenericPage } from './parsers/genericParser.js';

export const parserMap = {
  'chatgpt.com': parseChatGPT,
  'chat.openai.com': parseChatGPT,
  'claude.ai': parseClaude,
  default: parseGenericPage,
};

/**
 * Extract semantic structure from cleaned page text.
 * Delegates to a source-aware parser.
 * @param {string} cleanText
 * @param {string} source
 * @param {Function} parser
 * @returns {Object}
 */
export function extractSemanticStructure(cleanText, source, parser) {
  return parser(cleanText, { source });
}
