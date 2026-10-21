import type { ProviderAdapter } from '../types/provider';
import { ChatGPTAdapter } from './adapters/ChatGPTAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { GeminiAdapter } from './adapters/GeminiAdapter';

export class ProviderRegistry {
  private readonly _adapters = new Map<string, ProviderAdapter>([
    ['chatgpt', new ChatGPTAdapter()],
    ['claude',  new ClaudeAdapter()],
    ['gemini',  new GeminiAdapter()],
  ]);

  get(platform: string): ProviderAdapter | undefined {
    return this._adapters.get(platform);
  }

  isTrackedUrl(url: string): { adapter: ProviderAdapter; platform: string } | undefined {
    for (const [platform, adapter] of this._adapters) {
      if (adapter.isConversationUrl(url)) return { adapter, platform };
    }
    return undefined;
  }

  isProviderUrl(url: string): boolean {
    for (const [, adapter] of this._adapters) {
      if (url.startsWith(new URL(adapter.homeUrl).origin)) return true;
    }
    return false;
  }
}
