import { expect, test } from '@playwright/test';

// Route changes get extra time: against `next dev`, a page compiles on its
// first visit.
const NAVIGATION = { timeout: 30_000 };

/**
 * The dashboard half of the core loop: a new user signs up, creates a
 * project, writes a note, and finds it again in the notes list and in the
 * Cmd+K palette. Each run uses its own user, so it never depends on (or
 * leaves state for) another run.
 */
test('sign up, create a project, write a note and find it', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${run}@example.com`;
  const password = `e2e-password-${run}`;
  const projectName = `E2E project ${run}`;
  const noteLine = `E2E note ${run}`;

  // The dashboard's Content-Security-Policy (next.config.ts) must not block
  // anything the app itself does; browsers report violations on the console.
  const cspViolations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
  });

  await test.step('register', async () => {
    await page.goto('/register');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('At least 10 characters').fill(password);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
  });

  await test.step('no token is readable by page script', async () => {
    // The refresh token is an httpOnly cookie; the access token is memory-only.
    const cookies = await page.context().cookies();
    const refresh = cookies.find((c) => c.name === 'cd_refresh');
    expect(refresh, 'refresh cookie set by the API').toBeTruthy();
    expect(refresh!.httpOnly).toBe(true);

    const readable = await page.evaluate(() => ({
      cookie: document.cookie,
      storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    }));
    expect(readable.cookie).not.toContain('cd_refresh');
    expect(readable.storage).not.toContain(refresh!.value);
    expect(readable.storage, 'no JWT in web storage').not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
  });

  await test.step('a reload keeps the session (silent refresh from the cookie)', async () => {
    await page.reload();
    await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
  });

  await test.step('create a project', async () => {
    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByPlaceholder('e.g. RAG Research').fill(projectName);
    await page.getByRole('button', { name: /ChatGPT/ }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
  });

  await test.step('write a note', async () => {
    await page.getByRole('link', { name: 'New note' }).click();
    await expect(page).toHaveURL(/\/notes\/new\?project=/, NAVIGATION);
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(`${noteLine}\nWritten by the end-to-end test.`);
    // The first save creates the note and swaps the URL to /notes/{id}.
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/, NAVIGATION);
    await expect(page.getByText('Saved')).toBeVisible();
  });

  await test.step('see it in the notes list', async () => {
    await page.goto('/notes');
    await expect(page.getByText(noteLine).first()).toBeVisible();
  });

  await test.step('find it with Cmd+K', async () => {
    await page.getByRole('button', { name: 'Search (⌘K)' }).click();
    await page.getByPlaceholder('Search notes and projects…').fill(run);
    await expect(page.getByRole('option', { name: new RegExp(noteLine) })).toBeVisible();
  });

  expect(cspViolations, 'CSP blocked something the app needs').toEqual([]);
});
