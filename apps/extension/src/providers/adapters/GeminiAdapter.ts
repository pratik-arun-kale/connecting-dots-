import type { ProviderAdapter } from '../../types/provider';

export class GeminiAdapter implements ProviderAdapter {
  readonly platform = 'gemini';
  readonly homeUrl  = 'https://gemini.google.com/app';

  isConversationUrl(url: string): boolean {
    // Gemini conversation URLs look like: gemini.google.com/app/abc123...
    return /^https:\/\/gemini\.google\.com\/app\/[a-zA-Z0-9_-]+/.test(url);
  }

  async injectBootstrapMessage(tabId: number, message: string): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectGemini,
      args: [message],
    });
  }
}

function injectGemini(message: string): void {
  // Gemini uses a rich-text input; find the contenteditable textarea
  const editor =
    document.querySelector<HTMLElement>('rich-textarea [contenteditable="true"]') ??
    document.querySelector<HTMLElement>('.ql-editor[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');

  if (!editor) {
    throw new Error('[ConnectingDots] Gemini: input editor not found');
  }

  editor.focus();
  document.execCommand('insertText', false, message);

  setTimeout(() => {
    const sendBtn =
      document.querySelector<HTMLButtonElement>('button[aria-label="Send message"]') ??
      document.querySelector<HTMLButtonElement>('button.send-button') ??
      document.querySelector<HTMLButtonElement>('button[mat-icon-button][aria-label]');
    sendBtn?.click();
  }, 100);
}
