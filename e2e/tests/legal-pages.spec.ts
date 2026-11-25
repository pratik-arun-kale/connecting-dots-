import { expect, test } from '@playwright/test';

/** Privacy, terms and feedback are public, linked from sign-in, and feedback carries the version. */
test('privacy and terms open without signing in', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.getByText(/excerpts from your notes are sent to OpenAI/)).toBeVisible();
  await expect(page.getByText('Limited Use', { exact: false })).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
});

test('the extension’s feedback link opens an email with its version', async ({ page }) => {
  const contact = process.env.E2E_CONTACT_EMAIL;
  test.skip(!contact, 'set E2E_CONTACT_EMAIL to the dashboard build’s NEXT_PUBLIC_CONTACT_EMAIL');

  await page.goto('/feedback?from=extension&version=3.0.0');
  const href = await page.getByRole('link', { name: 'Write feedback' }).getAttribute('href');
  expect(href).toMatch(new RegExp(`^mailto:${contact!.replace(/[.@]/g, '\\$&')}\\?`));
  const body = decodeURIComponent(new URL(href!).searchParams.get('body') ?? '');
  expect(body).toContain('Version: 3.0.0');
  expect(body).toContain('From: extension');
  expect(body).toContain('What broke or confused you?');
});
