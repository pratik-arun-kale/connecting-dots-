import { expect, test } from '@playwright/test';

const NAVIGATION = { timeout: 30_000 };

/**
 * With the dashboard's /api/* proxy on (API_UPSTREAM_URL, as deployed), the
 * browser never contacts the API's own origin: everything goes to the
 * dashboard, so the sign-in cookie is same-site and survives a reload.
 * CI runs in this mode and sets E2E_DASHBOARD_PROXY=1.
 */
test.skip(process.env.E2E_DASHBOARD_PROXY !== '1', 'set E2E_DASHBOARD_PROXY=1 when the dashboard forwards /api/*');

test('the browser only talks to the dashboard, and a reload keeps you signed in', async ({ page, baseURL }) => {
  const dashboard = new URL(baseURL!).origin;
  const elsewhere: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol.startsWith('http') && url.origin !== dashboard) elsewhere.push(req.url());
  });

  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = `proxy-password-${run}`;
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(`proxy-${run}@example.com`);
  await page.getByPlaceholder('At least 10 characters').fill(password);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);

  const cookie = (await page.context().cookies()).find((c) => c.name === 'cd_refresh');
  expect(cookie?.domain).toBe(new URL(dashboard).hostname);
  expect(cookie?.path).toBe('/api/v1/auth');

  await page.reload();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
  expect(elsewhere).toEqual([]);
});
