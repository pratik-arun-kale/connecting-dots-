import { expect, test } from '@playwright/test';

const NAVIGATION = { timeout: 30_000 };

test('an account is deleted from Settings and can no longer sign in', async ({ page }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `delete-${run}@example.com`;
  const password = `delete-password-${run}`;
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('At least 10 characters').fill(password);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/notes$/, NAVIGATION);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/, NAVIGATION);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Delete my account' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your password').fill('not-the-password');
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(dialog.getByRole('alert')).toContainText("password isn't right");

  await dialog.getByLabel('Your password').fill(password);
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page).toHaveURL(/\/login$/, NAVIGATION);

  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible(NAVIGATION);
  await expect(page).toHaveURL(/\/login$/);
});
