import type { Provider } from './Provider.js';

// Conversation URLs: https://claude.ai/chat/{uuid}
const CONVERSATION_RE = /^https:\/\/claude\.ai\/chat\/[a-zA-Z0-9-]+/;

export const ClaudeProvider: Provider = {
  platform: 'claude',
  homeUrl: 'https://claude.ai/',
  matchesHost: (url) => url.startsWith('https://claude.ai/'),
  isConversationUrl: (url) => CONVERSATION_RE.test(url),
};
