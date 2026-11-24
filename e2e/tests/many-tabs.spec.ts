import { expect, test } from '@playwright/test';

const NAVIGATION = { timeout: 30_000 };
const TABS = 5;

/**
 * Every dashboard page load refreshes the session with the same cookie. Five
 * tabs opening at once used to look like a stolen token: all but one were
 * signed out, and the API revoked every session. Now tabs take turns (a Web
 * Lock), and the API tolerates a just-rotated token for a few seconds.
 */
test(`${TABS} tabs opened at once all stay signed in`, async ({ context, page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = `tabs-password-${run}`;
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(`tabs-${run}@example.com`);
  await page.getByPlaceholder('At least 10 characters').fill(password);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);

  const tabs = await Promise.all(Array.from({ length: TABS }, () => context.newPage()));
  await Promise.all(tabs.map((tab) => tab.goto('/notes')));
  for (const tab of tabs) {
    await expect(tab).toHaveURL(/\/notes$/, NAVIGATION);
    await expect(tab.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
  }

  // Still signed in afterwards: nothing was revoked.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
});
