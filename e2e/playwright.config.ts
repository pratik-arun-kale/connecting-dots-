import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against a stack that is already up — the API (docker compose up) and
 * the dashboard (npm run dev:dashboard, or `next start` in CI). Point it
 * elsewhere with E2E_BASE_URL.
 *
 * Every test signs up its own user, so start the API with
 * AUTH_REGISTER_LIMIT_PER_HOUR=100 (the default 5 per IP per hour runs out
 * part-way through). CI sets it.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
