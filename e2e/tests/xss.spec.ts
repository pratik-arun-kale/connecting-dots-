import { expect, request, test, type Page } from '@playwright/test';

/**
 * Captured content can't run script in the dashboard. Notes are opened in
 * the BlockNote editor and conversations are rendered with react-markdown —
 * both are tried, each with the usual payloads. The CSP still allows inline
 * scripts (see apps/dashboard/next.config.ts), so the renderers themselves
 * must neutralise these.
 *
 * Content is captured straight through the API (E2E_API_URL), the way the
 * extension sends it, then opened in the browser.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
const MARKER = 'xss-probe-visible-text';
const PAYLOADS = [
  MARKER,
  '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  '<svg onload="window.__xss=(window.__xss||0)+1"></svg>',
  '<script>window.__xss=(window.__xss||0)+1</script>',
  '[click me](javascript:window.__xss=1)',
].join('\n\n');

async function expectNothingRan(page: Page) {
  await expect(page.getByText(MARKER).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000); // give any injected handler time to fire
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
}

test('captured HTML and javascript: links never execute', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `xss-${run}@example.com`;
  const password = `xss-password-${run}`;

  const api = await request.newContext();
  const registered = await api.post(`${API}/auth/register`, { data: { email, password } });
  expect(registered.status(), await registered.text()).toBe(201);
  const headers = { Authorization: `Bearer ${(await registered.json()).access_token}` };

  const project = await api.post(`${API}/projects`, { headers, data: { name: `XSS ${run}` } });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = (await project.json()).id;

  const capture = async (body: Record<string, unknown>) => {
    const resp = await api.post(`${API}/projects/${projectId}/capture`, {
      headers,
      data: { idempotency_key: `xss-${run}-${body.platform}`, captured_at: new Date().toISOString(), ...body },
    });
    expect(resp.status(), await resp.text()).toBe(200);
    return (await resp.json()).context_id as string;
  };
  const noteId = await capture({
    platform: 'note',
    chat_url: '',
    title: `XSS note ${run}`,
    messages: [{ role: 'user', content: PAYLOADS, timestamp: null, index: 0 }],
  });
  const conversationId = await capture({
    platform: 'claude',
    chat_url: `https://claude.ai/chat/${run}`,
    title: `XSS conversation ${run}`,
    messages: [
      { role: 'user', content: 'show me something', timestamp: null, index: 0 },
      { role: 'assistant', content: PAYLOADS, timestamp: null, index: 1 },
    ],
  });
  await api.dispose();

  const dialogs: string[] = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });

  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

  await test.step('note, in the editor', async () => {
    await page.goto(`/notes/${noteId}`);
    await expectNothingRan(page);
  });

  await test.step('conversation, as rendered Markdown', async () => {
    await page.goto(`/notes/${conversationId}`);
    await expectNothingRan(page);
  });

  await test.step('both, in the notes list', async () => {
    await page.goto('/notes');
    await expectNothingRan(page);
  });

  expect(dialogs).toEqual([]);
});
