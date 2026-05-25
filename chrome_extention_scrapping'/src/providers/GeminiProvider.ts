import type { Provider } from './Provider.js';

// Conversation URLs: https://gemini.google.com/app/{conversationId}
const CONVERSATION_RE = /^https:\/\/gemini\.google\.com\/app\/[a-zA-Z0-9_-]+/;

export const GeminiProvider: Provider = {
  platform: 'gemini',
  homeUrl: 'https://gemini.google.com/',
  matchesHost: (url) => url.startsWith('https://gemini.google.com/'),
  isConversationUrl: (url) => CONVERSATION_RE.test(url),
};
