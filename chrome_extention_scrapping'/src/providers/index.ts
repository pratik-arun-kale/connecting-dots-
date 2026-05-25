import type { Provider } from './Provider.js';
import { ChatGPTProvider } from './ChatGPTProvider.js';
import { ClaudeProvider } from './ClaudeProvider.js';
import { GeminiProvider } from './GeminiProvider.js';

const ALL: Provider[] = [ChatGPTProvider, ClaudeProvider, GeminiProvider];

export const ProviderRegistry = {
  forUrl(url: string): Provider | null {
    return ALL.find((p) => p.matchesHost(url)) ?? null;
  },
  forPlatform(platform: string): Provider | null {
    return ALL.find((p) => p.platform === platform) ?? null;
  },
  all(): Provider[] {
    return ALL;
  },
};

export type { Provider };
export { ChatGPTProvider, ClaudeProvider, GeminiProvider };
