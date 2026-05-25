import { removeNoise } from './noiseRemover.js';
import { extractSemanticStructure, parserMap } from './semanticExtractor.js';
import { normalizeOutput } from './normalizer.js';

/**
 * Main pipeline entry point.
 * @param {{ title: string, url: string, timestamp: string, content: string }} rawCapture
 * @returns {{ metadata: Object, content: Object, stats: Object }}
 */
export function processCapture(rawCapture) {
  if (!rawCapture || typeof rawCapture.content !== 'string') {
    throw new Error('Raw capture must include a content string.');
  }

  const metadata = {
    title: rawCapture.title || '',
    url: rawCapture.url || '',
    capturedAt: rawCapture.timestamp || new Date().toISOString(),
    source: detectSource(rawCapture.url),
  };

  const cleanedText = removeNoise(rawCapture.content);
  const parser = selectParser(metadata.source);
  const semanticPayload = extractSemanticStructure(cleanedText, metadata.source, parser);
  return normalizeOutput(metadata, semanticPayload, rawCapture.content.length, cleanedText.length);
}

function detectSource(url = '') {
  if (typeof url !== 'string') return 'default';
  const hostname = url.toLowerCase().replace(/^https?:\/\//, '').split(/[\/\?#]/)[0];

  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    return 'chatgpt.com';
  }
  if (hostname.includes('claude.ai')) {
    return 'claude.ai';
  }
  return 'default';
}

function selectParser(source) {
  return parserMap[source] || parserMap.default;
}
