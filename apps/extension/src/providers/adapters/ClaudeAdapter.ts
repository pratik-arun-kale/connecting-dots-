import type { ProviderAdapter } from '../../types/provider';

export class ClaudeAdapter implements ProviderAdapter {
  readonly platform = 'claude';
  readonly homeUrl  = 'https://claude.ai/new';

  isConversationUrl(url: string): boolean {
    return /^https:\/\/claude\.ai\/chat\/[a-zA-Z0-9_-]+/.test(url);
  }

  async injectBootstrapMessage(tabId: number, message: string): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectClaude,
      args: [message],
    });
  }
}

function injectClaude(message: string): void {
  // Claude uses ProseMirror: find the contenteditable div inside the editor
  const editor =
    document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]') ??
    document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');

  if (!editor) {
    throw new Error('[ConnectingDots] Claude: input editor not found');
  }

  editor.focus();
  document.execCommand('insertText', false, message);

  setTimeout(() => {
    const sendBtn =
      document.querySelector<HTMLButtonElement>('button[aria-label="Send Message"]') ??
      document.querySelector<HTMLButtonElement>('button[data-testid="send-button"]') ??
      document.querySelector<HTMLButtonElement>('button[type="submit"]');
    sendBtn?.click();
  }, 100);
}
