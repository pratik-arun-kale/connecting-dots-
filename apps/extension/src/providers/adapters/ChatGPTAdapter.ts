import type { ProviderAdapter } from '../../types/provider';

export class ChatGPTAdapter implements ProviderAdapter {
  readonly platform = 'chatgpt';
  readonly homeUrl  = 'https://chatgpt.com/';

  isConversationUrl(url: string): boolean {
    return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/c\/[a-zA-Z0-9_-]+/.test(url);
  }

  async injectBootstrapMessage(tabId: number, message: string): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectChatGPT,
      args: [message],
    });
  }
}

// Runs in the page context — must be self-contained (no closures over outer scope)
function injectChatGPT(message: string): void {
  const editor =
    document.querySelector<HTMLElement>('div#prompt-textarea[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('[contenteditable="true"][data-id]');

  if (!editor) {
    throw new Error('[ConnectingDots] ChatGPT: input editor not found');
  }

  editor.focus();
  document.execCommand('insertText', false, message);

  // Allow React to process the input event before we look for the send button
  setTimeout(() => {
    const sendBtn =
      document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]') ??
      document.querySelector<HTMLButtonElement>('button[aria-label="Send message"]');
    sendBtn?.click();
  }, 100);
}
