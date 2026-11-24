export interface ProviderAdapter {
  readonly platform: string;
  /** URL opened when creating a new session tab. */
  readonly homeUrl: string;
  /** Returns true if this URL is a specific conversation (not the home/new page). */
  isConversationUrl(url: string): boolean;
  /** Types the bootstrap message into the provider's input and submits it. */
  injectBootstrapMessage(tabId: number, message: string): Promise<void>;
}
