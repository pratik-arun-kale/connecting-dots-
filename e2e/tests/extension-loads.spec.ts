import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * The built extension (apps/extension/dist — run `npm run build` there
 * first) loads in Chromium: the manifest is accepted, the background service
 * worker starts, and the popup renders its sign-in form without the
 * manifest's CSP blocking anything. Needs no API.
 */
const EXTENSION_DIR = resolve(__dirname, '../../apps/extension/dist');

test('the built extension loads and its popup renders', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cd-ext-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', // the full Chromium build supports extensions headless
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/);

    const page = await context.newPage();
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
    });

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    expect(cspViolations, 'manifest CSP blocked the popup').toEqual([]);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
