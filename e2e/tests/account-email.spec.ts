import { readFileSync } from 'fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Email verification and password reset through the dashboard.
 *
 * Needs the API running in development WITHOUT a RESEND_API_KEY, so each
 * email is written to the API's log instead of sent, and E2E_API_LOG
 * pointing at that log — this test reads the links from it. Skipped
 * otherwise (CI sets both).
 */
const API_LOG = process.env.E2E_API_LOG;
const NAVIGATION = { timeout: 30_000 };

test.skip(!API_LOG, 'set E2E_API_LOG to the API log file to run the email tests');

/** The newest `path?token=…` link emailed to `email`, waiting for it to be logged. */
async function linkFromLog(email: string, path: string): Promise<string> {
  const pattern = new RegExp(`https?://[^\\s"'\\\\]+${path}\\?token=[\\w-]+`, 'g');
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const lines = readFileSync(API_LOG!, 'utf8').split('\n').filter((l) => l.includes(email));
        const found = lines.flatMap((l) => l.match(pattern) ?? []);
        link = found.at(-1);
        return link;
      },
      { message: `no ${path} link for ${email} in ${API_LOG}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return new URL(link!).pathname + new URL(link!).search;
}

async function register(page: Page, email: string, password: string) {
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('At least 10 characters').fill(password);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
}

test('a new account confirms its email from the emailed link', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `verify-${run}@example.com`;
  await register(page, email, `verify-password-${run}`);

  const banner = page.getByRole('status').filter({ hasText: 'Confirm your email' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(email);

  await page.goto(await linkFromLog(email, '/verify-email'));
  await expect(page.getByText('Your email is confirmed.')).toBeVisible(NAVIGATION);

  await page.getByRole('link', { name: 'Go to your notes' }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible(NAVIGATION);
  await expect(banner).toHaveCount(0);
});

test('a forgotten password is reset from the emailed link', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `reset-${run}@example.com`;
  const newPassword = `new-password-${run}`;
  await register(page, email, `old-password-${run}`);
  await page.context().clearCookies(); // signed out, as someone who forgot would be
  await page.evaluate(() => localStorage.clear());

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/, NAVIGATION);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(`If ${email} has an account`)).toBeVisible();

  await page.goto(await linkFromLog(email, '/reset-password'));
  await page.getByPlaceholder('At least 10 characters').fill(newPassword);
  await page.getByPlaceholder('••••••••').fill(newPassword);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Your password is changed.')).toBeVisible(NAVIGATION);

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);
});
