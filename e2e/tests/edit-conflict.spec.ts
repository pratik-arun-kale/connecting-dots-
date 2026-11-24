import { expect, request, test, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
const NAVIGATION = { timeout: 30_000 };

/**
 * One note open in two tabs. Tab A saves first; tab B's next save must not
 * silently overwrite A — it shows the conflict banner — and "Keep mine"
 * then saves B's text on purpose.
 */
test('editing a note in two tabs never silently loses text', async ({ browser }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `conflict-${run}@example.com`;
  const password = `conflict-password-${run}`;

  const api = await request.newContext();
  const reg = await api.post(`${API}/auth/register`, { data: { email, password } });
  expect(reg.status(), await reg.text()).toBe(201);
  const headers = { Authorization: `Bearer ${(await reg.json()).access_token}` };
  const project = await api.post(`${API}/projects`, { headers, data: { name: `Conflict ${run}` } });
  const captured = await api.post(`${API}/projects/${(await project.json()).id}/capture`, {
    headers,
    data: {
      idempotency_key: `conflict-${run}`,
      platform: 'note',
      chat_url: '',
      captured_at: new Date().toISOString(),
      title: 'Conflict note',
      messages: [{ role: 'user', content: 'Shared starting text.', timestamp: null, index: 0 }],
      kind: 'written',
    },
  });
  const noteId = (await captured.json()).context_id as string;

  const context = await browser.newContext();
  const tabA = await context.newPage();
  await tabA.goto('/login');
  await tabA.getByPlaceholder('you@example.com').fill(email);
  await tabA.getByPlaceholder('••••••••').fill(password);
  await tabA.getByRole('button', { name: 'Sign in' }).click();
  await expect(tabA).toHaveURL(/\/notes$/, NAVIGATION);

  // The note's text also shows in the sidebar; the editor is what matters.
  const editor = (tab: Page) => tab.locator('[contenteditable="true"]').first();

  const tabB = await context.newPage();
  for (const tab of [tabA, tabB]) {
    await tab.goto(`/notes/${noteId}`);
    await expect(editor(tab).getByText('Shared starting text.')).toBeVisible(NAVIGATION);
  }

  const typeAtEnd = async (tab: Page, text: string) => {
    await editor(tab).getByText('Shared starting text.').click();
    await tab.keyboard.press('End');
    await tab.keyboard.type(text);
  };

  await test.step('tab A saves first', async () => {
    await typeAtEnd(tabA, ' Edit from A.');
    await expect(tabA.getByText('Saved')).toBeVisible(NAVIGATION);
  });

  await test.step("tab B's save is refused, with a choice", async () => {
    await typeAtEnd(tabB, ' Edit from B.');
    const banner = tabB.getByRole('alert').filter({ hasText: 'edited somewhere else' });
    await expect(banner).toBeVisible(NAVIGATION);
    await expect(tabB.getByText('Not saved')).toBeVisible();

    const current = await api.get(`${API}/contexts/detail/${noteId}`, { headers });
    expect((await current.json()).content_md).toContain('Edit from A.');
  });

  await test.step('"Keep mine" saves B on purpose', async () => {
    await tabB.getByRole('button', { name: 'Keep mine' }).click();
    await expect(tabB.getByText('Saved')).toBeVisible(NAVIGATION);
    await expect(tabB.getByRole('alert').filter({ hasText: 'edited somewhere else' })).toHaveCount(0);

    const current = await api.get(`${API}/contexts/detail/${noteId}`, { headers });
    const body = (await current.json()).content_md as string;
    expect(body).toContain('Edit from B.');
    expect(body).not.toContain('Edit from A.');
  });

  await api.dispose();
  await context.close();
});
