export type Platform = 'chatgpt' | 'claude' | 'gemini';

export interface Provider {
  readonly platform: Platform;
  readonly homeUrl: string;
  /** Returns true if this URL is hosted on this platform. */
  matchesHost(url: string): boolean;
  /** Returns true if the URL represents a specific conversation (not the home/landing page). */
  isConversationUrl(url: string): boolean;
}
