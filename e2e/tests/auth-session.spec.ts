import { expect, request, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
const NAVIGATION = { timeout: 30_000 };

/**
 * A browser still holding a refresh token in localStorage from before
 * cookie sessions: on the next visit the dashboard trades it once for an
 * httpOnly cookie, stays logged in, and no longer stores the token.
 */
test('an old localStorage refresh token moves into a cookie', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const api = await request.newContext();
  // Body mode, as the old dashboard used: the refresh token comes back in JSON.
  const registered = await api.post(`${API}/auth/register`, {
    data: { email: `legacy-${run}@example.com`, password: `legacy-password-${run}` },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const { refresh_token: legacy, user } = await registered.json();
  await api.dispose();

  // What the old build persisted (zustand persist, version 0).
  await page.addInitScript(
    ([token, u]) => {
      if (sessionStorage.getItem('seeded')) return; // only before the first load
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cw-auth', JSON.stringify({ state: { refreshToken: token, user: u }, version: 0 }));
    },
    [legacy, user] as const,
  );

  await page.goto('/notes');
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);

  const cookie = (await page.context().cookies()).find((c) => c.name === 'cd_refresh');
  expect(cookie?.httpOnly).toBe(true);
  const stored = await page.evaluate(() => localStorage.getItem('cw-auth') ?? '');
  expect(stored).not.toContain(legacy);

  // And the session now lives on the cookie alone.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
});
