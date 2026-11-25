import { z } from 'zod';

// ──────────────────────────────────────────────
// Public environment, validated once at startup
// ──────────────────────────────────────────────
// Each variable is read with a literal `process.env.NEXT_PUBLIC_…` so Next.js
// can inline it into the client bundle. A missing or malformed value throws
// here, naming the variable, instead of the app quietly talking to the wrong
// backend. See .env.example for what each one is.

const schema = z.object({
  /** Backend API base including the version prefix: /api/v1 to go through this
   *  dashboard's own proxy (src/proxy.ts, deployed), or the API's own URL
   *  ending in /api/v1 (local development; see .env.example). */
  NEXT_PUBLIC_API_BASE_URL: z.union([
    z.string().regex(/^\/[\w\-/]*$/, 'must be an http(s) URL or a path such as /api/v1'),
    z.url({ protocol: /^https?$/ }),
  ]),
  /** Chrome extension ID (32 letters a–p). Optional: without it the dashboard
   *  works but can't ask the extension to open AI sessions. */
  NEXT_PUBLIC_EXTENSION_ID: z
    .string()
    .regex(/^[a-p]{32}$/, 'must be a 32-letter Chrome extension ID (a–p)')
    .optional()
    .or(z.literal('')),
  /** Where privacy questions, deletion requests and feedback go; shown on the
   *  privacy, terms and feedback pages. Required before launch. */
  NEXT_PUBLIC_CONTACT_EMAIL: z.email().optional().or(z.literal('')),
  /** Set by Vercel on every deployment (the commit it was built from). */
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_EXTENSION_ID: process.env.NEXT_PUBLIC_EXTENSION_ID,
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
});

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid dashboard environment — check apps/dashboard/.env.local (see .env.example):\n${problems}`);
}

export const env = {
  apiBaseUrl: parsed.data.NEXT_PUBLIC_API_BASE_URL,
  extensionId: parsed.data.NEXT_PUBLIC_EXTENSION_ID ?? '',
  contactEmail: parsed.data.NEXT_PUBLIC_CONTACT_EMAIL ?? '',
  /** Short commit of this build, or "local". Sent with feedback. */
  version: parsed.data.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
};
