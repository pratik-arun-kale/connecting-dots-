import { z } from 'zod';

// ──────────────────────────────────────────────
// Public environment, validated once at startup
// ──────────────────────────────────────────────
// Each variable is read with a literal `process.env.NEXT_PUBLIC_…` so Next.js
// can inline it into the client bundle. A missing or malformed value throws
// here, naming the variable, instead of the app quietly talking to the wrong
// backend. See .env.example for what each one is.

const schema = z.object({
  /** Backend API base including the version prefix, e.g. https://api.example.com/api/v1 */
  NEXT_PUBLIC_API_BASE_URL: z.url({ protocol: /^https?$/ }),
  /** Chrome extension ID (32 letters a–p). Optional: without it the dashboard
   *  works but can't ask the extension to open AI sessions. */
  NEXT_PUBLIC_EXTENSION_ID: z
    .string()
    .regex(/^[a-p]{32}$/, 'must be a 32-letter Chrome extension ID (a–p)')
    .optional()
    .or(z.literal('')),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_EXTENSION_ID: process.env.NEXT_PUBLIC_EXTENSION_ID,
});

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid dashboard environment — check apps/dashboard/.env.local (see .env.example):\n${problems}`);
}

export const env = {
  apiBaseUrl: parsed.data.NEXT_PUBLIC_API_BASE_URL,
  extensionId: parsed.data.NEXT_PUBLIC_EXTENSION_ID ?? '',
};
