import { splitLines, collapseBlankLines } from '../utils.js';

const ROLE_PATTERNS = [
  { suffix: /^(user|you):/i, role: 'user' },
  { suffix: /^(assistant|chatgpt|openai):/i, role: 'assistant' },
  { suffix: /^(system):/i, role: 'system' },
];

function detectRole(line) {
  const trimmed = line.trim();
  for (const pattern of ROLE_PATTERNS) {
    if (pattern.suffix.test(trimmed)) return pattern.role;
  }
  return null;
}

function normalizeMessageContent(lines) {
  const content = lines.join('\n').trim();
  return collapseBlankLines(content);
}

/**
 * Parse cleaned ChatGPT transcript text into ordered messages.
 * @param {string} cleanText
 * @returns {{ type: string, content: { messages: Array } }}
 */
export function parseChatGPT(cleanText) {
  const lines = splitLines(cleanText);
  const messages = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const role = detectRole(line);

    if (role) {
      const text = line.replace(/^(user|you|assistant|chatgpt|openai|system):\s*/i, '');
      if (current) {
        current.content = normalizeMessageContent(current.contentLines);
        messages.push(current);
      }
      current = { role, contentLines: text ? [text] : [] };
      continue;
    }

    if (!current) {
      current = { role: 'user', contentLines: [] };
    }
    current.contentLines.push(line);
  }

  if (current) {
    current.content = normalizeMessageContent(current.contentLines);
    delete current.contentLines;
    if (current.content) messages.push(current);
  }

  if (messages.length === 0) {
    return { type: 'chat', content: { messages: [{ role: 'user', content: cleanText.trim() }] } };
  }

  return {
    type: 'chat',
    content: {
      messages: messages.map(({ role, content }) => ({ role, content })),
    },
  };
}
