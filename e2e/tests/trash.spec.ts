import { expect, request, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
const NAVIGATION = { timeout: 30_000 };

/** Deleting a note: Undo from the toast, restore from the Trash, delete for good. */
test('a deleted note can be undone, restored from the Trash, or deleted for good', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `trash-${run}@example.com`;
  const password = `trash-password-${run}`;
  const text = `Trash me ${run}`;

  const api = await request.newContext();
  const reg = await api.post(`${API}/auth/register`, { data: { email, password } });
  expect(reg.status(), await reg.text()).toBe(201);
  const headers = { Authorization: `Bearer ${(await reg.json()).access_token}` };
  const project = await api.post(`${API}/projects`, { headers, data: { name: `Trash ${run}` } });
  const captured = await api.post(`${API}/projects/${(await project.json()).id}/capture`, {
    headers,
    data: {
      idempotency_key: `trash-${run}`,
      platform: 'note',
      chat_url: '',
      captured_at: new Date().toISOString(),
      title: text,
      messages: [{ role: 'user', content: text, timestamp: null, index: 0 }],
      kind: 'written',
    },
  });
  const noteId = (await captured.json()).context_id as string;
  await api.dispose();

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);

  const deleteFromNotePage = async () => {
    await page.goto(`/notes/${noteId}`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete note' }).click();
    await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
    await expect(page.getByRole('status').filter({ hasText: 'Note moved to Trash.' })).toBeVisible();
  };

  await test.step('Undo from the toast', async () => {
    await deleteFromNotePage();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page).toHaveURL(new RegExp(`/notes/${noteId}$`), NAVIGATION);
    await expect(page.locator('[contenteditable="true"]').first().getByText(text)).toBeVisible(NAVIGATION);
  });

  await test.step('restore from the Trash page', async () => {
    await deleteFromNotePage();
    await page.getByRole('link', { name: 'Trash' }).click();
    await expect(page).toHaveURL(/\/trash$/, NAVIGATION);
    const row = page.getByRole('listitem').filter({ hasText: text });
    await expect(row).toContainText('removed for good in 30 days');
    await row.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('The Trash is empty')).toBeVisible(NAVIGATION);
    await page.goto(`/notes/${noteId}`);
    await expect(page.locator('[contenteditable="true"]').first().getByText(text)).toBeVisible(NAVIGATION);
  });

  await test.step('delete for good', async () => {
    await deleteFromNotePage();
    await page.goto('/trash');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('listitem').filter({ hasText: text }).getByRole('button', { name: 'Delete for good' }).click();
    await expect(page.getByText('The Trash is empty')).toBeVisible(NAVIGATION);
    await page.goto(`/notes/${noteId}`);
    await expect(page.locator('[contenteditable="true"]').getByText(text)).toHaveCount(0);
  });
});
