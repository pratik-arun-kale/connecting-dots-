import type { Provider } from './Provider.js';

// Conversation URLs: https://chat.openai.com/c/{uuid}
const CONVERSATION_RE = /^https:\/\/chat\.openai\.com\/c\/[a-zA-Z0-9-]+/;

export const ChatGPTProvider: Provider = {
  platform: 'chatgpt',
  homeUrl: 'https://chat.openai.com/',
  matchesHost: (url) => url.startsWith('https://chat.openai.com/'),
  isConversationUrl: (url) => CONVERSATION_RE.test(url),
};
