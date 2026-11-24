import { expect, test } from '@playwright/test';

const NAVIGATION = { timeout: 30_000 };

/**
 * A reload while the API is still starting (Cloud Run scaled to zero): the
 * first silent refresh hangs and then fails. The dashboard says it's waking
 * the server, asks again, and the page loads signed in, not on /login.
 */
test('the first load after the API was asleep still signs you in', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = `cold-password-${run}`;
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(`cold-${run}@example.com`);
  await page.getByPlaceholder('At least 10 characters').fill(password);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);

  let refreshes = 0;
  await page.route('**/api/v1/auth/refresh', async (route) => {
    refreshes += 1;
    if (refreshes === 1) {
      await new Promise((r) => setTimeout(r, 4_000)); // past the 3 s "waking up" mark
      await route.abort('connectionrefused');
      return;
    }
    await route.continue();
  });

  await page.reload();
  const notice = page.getByRole('status').filter({ hasText: 'Waking up the server' });
  await expect(notice).toBeVisible({ timeout: 10_000 });

  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
  await expect(notice).toHaveCount(0);
  expect(refreshes).toBeGreaterThanOrEqual(2); // the failed one, then the retry
});
