import type { ExtensionMessage } from '@/types';

// Set NEXT_PUBLIC_EXTENSION_ID in .env.local to the extension's chrome ID.
// Find it at chrome://extensions after loading the extension unpacked.
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChromeRuntime = any;

function getChromeRuntime(): ChromeRuntime | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w?.chrome?.runtime ?? null;
}

export const extensionService = {
  isAvailable(): boolean {
    if (!EXTENSION_ID) {
      console.warn(
        '[Extension] NEXT_PUBLIC_EXTENSION_ID is not set.\n' +
        '  → Open chrome://extensions, enable Developer Mode,\n' +
        '  → load the chrome_extention_scrapping folder unpacked,\n' +
        '  → copy the extension ID and add it to context-workspace/.env.local:\n' +
        '  →   NEXT_PUBLIC_EXTENSION_ID=<paste-id-here>\n' +
        '  → Then restart the Next.js dev server.'
      );
      return false;
    }
    if (getChromeRuntime() === null) {
      console.warn('[Extension] chrome.runtime not available — are you running in Chrome with the extension installed?');
      return false;
    }
    return true;
  },

  sendMessage(message: ExtensionMessage): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const runtime = getChromeRuntime();
      if (!runtime || !EXTENSION_ID) {
        console.warn('[Extension] sendMessage skipped — extension not available (see warnings above).');
        resolve({ success: false, error: 'Extension not available' });
        return;
      }

      runtime.sendMessage(EXTENSION_ID, message, (response: { success: boolean; error?: string } | undefined) => {
        if (runtime.lastError) {
          console.warn('[Extension] sendMessage error:', runtime.lastError.message);
          resolve({ success: false, error: runtime.lastError.message });
        } else {
          resolve(response ?? { success: true });
        }
      });
    });
  },

  createProviderSession(
    sessionId: string,
    projectId: string,
    platform: string,
    bootstrapMessage: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendMessage({
      type: 'CREATE_PROVIDER_SESSION',
      sessionId,
      projectId,
      platform: platform as 'chatgpt' | 'claude' | 'gemini',
      bootstrapMessage,
    });
  },
};
