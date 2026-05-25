import { normalizeHeadingTree } from './utils.js';

/**
 * Turn parser output into the final pipeline schema.
 * @param {Object} metadata
 * @param {Object} semanticPayload
 * @param {number} rawLength
 * @param {number} cleanedLength
 * @returns {Object}
 */
export function normalizeOutput(metadata, semanticPayload, rawLength, cleanedLength) {
  const normalizedContent = {
    type: semanticPayload.type || 'document',
    ...semanticPayload.content,
  };

  if (normalizedContent.sections) {
    normalizedContent.sections = normalizeHeadingTree(normalizedContent.sections);
  }

  return {
    metadata,
    content: normalizedContent,
    stats: {
      rawLength,
      cleanedLength,
      messagesCount: calculateMessageCount(normalizedContent),
    },
  };
}

function calculateMessageCount(content) {
  if (content.type === 'chat' && Array.isArray(content.messages)) {
    return content.messages.length;
  }
  if (Array.isArray(content.sections)) {
    return content.sections.reduce((sum, section) => sum + (section.items?.length || 0), 0);
  }
  return 0;
}
